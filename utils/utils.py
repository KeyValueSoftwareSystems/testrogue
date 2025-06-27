import os
import re

from faker import Faker
import contextlib
import yaml
from langchain_core.language_models import BaseChatModel
from pydantic import ValidationError

from logger_config import logger
from langchain.prompts import PromptTemplate
import time

import requests
import json
import logging
from typing import List, Optional

from utils.constants import HTTP_METHODS
from utils.models import ExtractedSwagger, Endpoint, Parameter, RequestBody, Response, TestCase

logger = logging.getLogger(__name__)


def extract_endpoints_from_swagger(swagger_url: str) -> ExtractedSwagger:
    try:
        response = requests.get(swagger_url)
        response.raise_for_status()
        swagger_data = response.json()
        swagger_version = swagger_data.get("swagger")  # Safely get the 'swagger' key

        if swagger_version != "2.0":
            logger.error("Unsupported Swagger version: %s", swagger_version)
            raise ValueError("Only Swagger 2.0 definitions are currently supported.")
        else:
            # If it's 2.0, proceed with your extraction logic
            # For demonstration, let's just indicate success
            logger.info("Swagger version 2.0 detected. Proceeding with extraction.")

        endpoints = []
        base_path = swagger_data.get("basePath", "")
        definitions = swagger_data.get("definitions", {})

        for path, methods in list(swagger_data.get("paths", {}).items()):
            for method, details in methods.items():
                if method.lower() not in ["get", "post", "put", "delete", "patch"]:
                    continue

                params = [
                    Parameter(
                        name=param.get("name"),
                        in_=param.get("in"),
                        description=param.get("description", ""),
                        required=param.get("required", False),
                        type=param.get("type"),
                        format=param.get("format"),
                        schema_data=param.get("schema"),
                        enum=param.get("enum", []),
                        items=param.get("items", {})
                    )
                    for param in details.get("parameters", [])
                ]

                body_param = next((param for param in details.get("parameters", []) if param.get("in") == "body"), None)
                form_data_params = [param for param in details.get("parameters", []) if param.get("in") == "formData"]

                if body_param:
                    raw_schema = body_param.get("schema", {})
                    resolved_schema = resolve_schema_refs(raw_schema, definitions)
                    request_body = RequestBody(
                        required=body_param.get("required", False),
                        schema_data=resolved_schema
                    )
                elif form_data_params:
                    # Combine formData fields into a synthetic schema
                    form_schema = {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }

                    for param in form_data_params:
                        name = param["name"]
                        is_required = param.get("required", False)
                        param_type = param.get("type", "string")

                        if param_type == "file":
                            form_schema["properties"][name] = {
                                "type": "string",  # Note: you will treat this as a file in request step
                                "format": "binary",
                                "description": param.get("description", "")
                            }
                        else:
                            form_schema["properties"][name] = {
                                "type": param_type,
                                "description": param.get("description", ""),
                                "enum": param.get("enum", []),
                                "format": param.get("format", None)
                            }

                        if is_required:
                            form_schema["required"].append(name)
                    request_body = RequestBody(
                        required=True,
                        schema_data=form_schema
                    )
                else:
                    request_body = RequestBody()

                responses = {
                    str(code): Response(
                        description=resp.get("description", ""),
                        schema_data=resolve_schema_refs(resp.get("schema", {}), definitions)
                    )
                    for code, resp in details.get("responses", {}).items()
                }

                endpoint = Endpoint(
                    full_path=base_path + path,
                    path=path,
                    method=method.upper(),
                    operation_id=details.get("operationId", f"{method}_{path.replace('/', '_')}"),
                    summary=details.get("summary", ""),
                    description=details.get("description", ""),
                    tags=details.get("tags", []),
                    parameters=params,
                    request_body=request_body,
                    responses=responses,
                    security=details.get("security", [])
                )
                endpoints.append(endpoint)

        return ExtractedSwagger(endpoints=endpoints, definitions=definitions)

    except Exception as e:
        logger.error(f"Error extracting endpoints: {e}")
        return ExtractedSwagger(endpoints=[], definitions={})


def print_endpoints(endpoints: list):
    if not endpoints:
        logger.warning("No endpoints to print.")
        return

    logger.info("Extracted Endpoints:")
    for endpoint in endpoints:
        logger.info(
            f"  Path: {endpoint['path']}, Method: {endpoint['method']}, Operation ID: {endpoint.get('summary', 'N/A')}")
    print("Endpoints printed successfully.")


def generate_test_cases(
        endpoints: List[Endpoint],
        llm: BaseChatModel,
        swagger_definitions: Optional[dict] = None
) -> List[dict]:
    """
    Generate structured test cases using LLM for a list of Pydantic-defined endpoints.
    """

    if not endpoints:
        logger.info("No endpoints to generate test cases for.")
        return []

    prompt_template = PromptTemplate.from_template("""
        You are an expert API tester. For the following API endpoint, generate multiple test cases:
        - Happy path (valid inputs)
        - Missing or invalid required parameters
        - Security and authorization checks **only if** the endpoint requires authentication (see Security Requirements section below). Skip these tests if `Security Requirements` is empty. include auth related testcase only if the security requirement section have auth keys
        - Edge cases (boundary values, empty input, etc.)
        
        Use the parameters and request body schema exactly as provided below. If the request body schema includes `properties`, construct valid request bodies using only those properties. 
        Do not add fields not present in the schema. 

        Authorization headers should **only** be included in test cases if `Security Requirements` is non-empty.
 
        Refer to the example Request Body for constructing valid and edge case inputs.
        If no request body is present or required, leave it empty `{{}}` but still include the field in the test case.
        
        
        Always follow the structure below **exactly** for each test case:
        Test Case ID: <number>
        Test Case Name: <clear title>
        Description: <purpose of the test>
        Endpoint: {endpoint_path}
        Method: {method}
        Operation ID: {operation_id}
        Summary: {summary}
        Request Body:
        {request_body}
        Expected Status Code: <code>
        Headers:
        {headers}
        
        --- Endpoint Metadata ---
        Parameters:
        {parameters}
        
        Request Body Schema:
        {request_schema}
        
        Response Codes:
        {responses}
        
        Security Requirements:
        {security}
        
        Generate at least 5 test cases using this data.
        Do NOT invent fields outside the provided metadata.
        
        Generate test cases in valid JSON format only. Escape all quotes properly. Avoid programming expressions (like .repeat()) and keep long strings under 100 characters. 
        Do NOT include:
        - Markdown formatting (no triple backticks)
        - Explanatory text
        - Comments
        
        Your output must look like:
        
        [
          {{
            "Test Case ID": 1,
            "Test Case Name": "Descriptive name",
            "Description": "Purpose of the test",
            "Endpoint": "/example",
            "Method": "POST",
            "Operation ID": "addExample",
            "Summary": "Brief summary from spec",
            "Request Body": {{"field": "value" }},
            "Expected Status Code": 200,
            "Headers": {{}}
          }}
        ]

""")

    raw_test_cases = []
    for endpoint in endpoints:
        try:
            parameters_repr = json.dumps([param.dict(by_alias=True) for param in endpoint.parameters], indent=2)
            responses_repr = json.dumps({k: v.dict() for k, v in endpoint.responses.items()}, indent=2)
            security_repr = json.dumps(endpoint.security or [], indent=2)
            definitions_repr = json.dumps(swagger_definitions or {}, indent=2)
            raw_schema = endpoint.request_body.schema_data or {}
            resolved_schema = raw_schema

            # Final check
            if endpoint.method in ["POST", "PUT", "PATCH"] and resolved_schema:
                if "properties" in resolved_schema:
                    request_body_example = build_sample_payload(resolved_schema)
                    request_body_prompt = json.dumps(request_body_example, indent=2)
                else:
                    request_body_prompt = json.dumps(resolved_schema, indent=2)
            else:
                request_body_prompt = "{}"

            prompt = prompt_template.format(
                endpoint_path=endpoint.path,
                method=endpoint.method,
                operation_id=endpoint.operation_id,
                summary=endpoint.summary,
                parameters=parameters_repr,
                request_schema=json.dumps(resolved_schema, indent=2),
                responses=responses_repr,
                security=security_repr,
                request_body=request_body_prompt,
                headers="{}",
                # definitions=definitions_repr # Can pass schema def if context need more info
            )

            raw = llm.generate_response(prompt)

            try:
                test_cases = extract_json_array(raw)
            except ValueError as ve:
                logger.error(f"LLM output parse error for {endpoint.path}: {ve}")
                continue

            for case in test_cases:
                try:
                    validated = TestCase(**case)
                    raw_test_cases.append(validated.dict(by_alias=True))
                except ValidationError as ve:
                    logger.warning(f"Validation failed for test case on {endpoint.path}: {ve}")

            logger.info(f"Generated test cases for {endpoint.method} {endpoint.path}")

        except Exception as e:
            logger.exception(f"Error generating test cases for {endpoint.path}: {e}")
            continue

    logger.info(f"Generated {len(raw_test_cases)} total test cases.")
    return raw_test_cases

def is_multipart_request(body) -> bool:
    """Detect if request body has file-like values indicating multipart/form-data."""
    if isinstance(body, (dict, list)):
        values = body.values() if isinstance(body, dict) else body
        return any(contains_file(v) for v in values)
    return False

def send_request(method: str, url: str, headers: dict, body) -> requests.Response:
    """
    Send an HTTP request, auto-detecting if multipart/form-data is needed for file uploads.
    """
    if method == "POST" and is_multipart_request(body):
        data, files = extract_form_data_and_files(body)
        with contextlib.ExitStack() as stack:
            opened_files = {k: stack.enter_context(open(v, "rb")) for k, v in files.items()}
            return requests.post(url, data=data, files=opened_files, headers=headers)

    request_func = HTTP_METHODS.get(method, requests.get)
    return request_func(url, json=body, headers=headers, timeout=10)


def build_result(status: str, response_time: float, code: int = None, error: str = None) -> dict:
    """Create a standardized result object for each test case."""
    return {
        "status": status,
        "response_time": response_time,
        "actual_status_code": code,
        "error": error,
    }


def load_base_url() -> str:
    """Safely load API base URL from config, with fallback."""
    try:
        config_path = os.path.abspath("config.yaml")
        with open(config_path, "r") as f:
            config = yaml.safe_load(f)
            return config.get("api", {}).get("base_url", "https://petstore.swagger.io/v2")
    except (FileNotFoundError, KeyError, yaml.YAMLError) as e:
        logger.error("Error loading configuration: %s. Using default base URL.", e)
        return "https://petstore.swagger.io/v2"


def execute_test_cases(test_cases: list) -> dict:
    """
    Executes a list of test cases and returns a detailed report including summary.
    """
    results = {}
    total_cases, passed_cases, failed_cases = 0, 0, 0
    start_time = time.time()
    base_url = load_base_url()

    for test_case in test_cases:
        total_cases += 1

        test_name = test_case.get("Test Case Name", "Unnamed")
        request_body = test_case.get("Request Body", {})
        expected_status = test_case.get("Expected Status Code", 200)
        headers = test_case.get("Headers", {})
        method = test_case.get("Method", "GET").upper()
        endpoint = test_case.get("Endpoint", "")
        url = f"{base_url}{endpoint}"

        logger.info("Executing: [%s] %s %s", test_name, method, url)
        logger.debug("Payload: %s | Headers: %s", request_body, headers)

        try:
            start = time.time()
            response = send_request(method, url, headers, request_body)
            duration = time.time() - start

            if response.status_code == expected_status:
                passed_cases += 1
                results[test_name] = build_result("PASSED", duration, response.status_code)
                logger.info(f"Test Case: {test_name} - PASSED - Status Code: {response.status_code} - Time: {duration:.4f}s")
            else:
                failed_cases += 1
                results[test_name] = build_result("FAILED", duration, response.status_code)
                logger.error(f"Test Case: {test_name} - FAILED - Expected: {expected_status}, Got: {response.status_code} - Response: {response.text}")

        except requests.exceptions.RequestException as e:
            failed_cases += 1
            results[test_name] = build_result("ERROR", None, error=str(e))
            logger.error("ERROR [%s] - Exception: %s", test_name, str(e), exc_info=True)

    total_time = time.time() - start_time
    results["summary"] = {
        "total_cases": total_cases,
        "passed_cases": passed_cases,
        "failed_cases": failed_cases,
        "total_time": total_time,
    }
    return results

def contains_file(value):
    if isinstance(value, str):
        return value.lower().endswith((".jpg", ".jpeg", ".png", ".pdf"))
    return False

def extract_form_data_and_files(body):
    data = {}
    files = {}
    if isinstance(body, dict):
        items = body.items()
    elif isinstance(body, list):
        # Flatten and key by index if needed (bulk user upload etc.)
        items = [(str(i), v) for i, v in enumerate(body)]
    else:
        items = []

    for key, value in items:
        if contains_file(value):
            try:
                files[key] = open(value, "rb")
            except Exception as e:
                logger.error(f"Failed to open file for key '{key}': {value} - {e}")
        else:
            data[key] = value
    return data, files


def extract_json_array(llm_output: str) -> List[dict]:
    """
    Tries to robustly extract a JSON array from the LLM output, even if it's slightly malformed.
    """
    llm_output = llm_output.strip()

    # Remove markdown fencing if any
    if llm_output.startswith("```"):
        llm_output = llm_output.strip("`").strip()
        if llm_output.startswith("json"):
            llm_output = llm_output[4:].strip()

    # First try direct JSON parse
    try:
        parsed = json.loads(llm_output)
        if isinstance(parsed, list):
            return parsed
        else:
            raise ValueError("Top-level structure is not a JSON array.")
    except json.JSONDecodeError as e:
        pass  # Proceed to fallback

    # Attempt to fix common issues:
    fixed = None
    try:
        # Replace single quotes with double quotes
        fixed = re.sub(r"(?<!\\)'", '"', llm_output)

        # Remove trailing commas
        fixed = re.sub(r",(\s*[}\]])", r"\1", fixed)

        # Remove comments if any (// or # style)
        fixed = re.sub(r"(?m)^\s*(//|#).*$", "", fixed)

        # Fix some missing commas between string-ending and next key
        fixed = re.sub(r'(":[^"]*")(\s*")', r'\1,\2', fixed)  # "...": "val" "next"
        fixed = re.sub(r'(\}|\])\s*{', r'\1, {', fixed)  # } { → }, {

        # Retry parsing
        parsed = json.loads(fixed)
        if not isinstance(parsed, list):
            raise ValueError("Fixed structure is not a JSON array.")
        return parsed
    except Exception as e:
        logger.error("Failed to parse LLM JSON output. Output:\n%s", fixed)
        raise ValueError(f"LLM response is not valid JSON even after fixing: {e}")


def resolve_schema_refs(schema: dict, definitions: dict) -> dict:
    """
    Recursively resolve $ref objects in a Swagger schema using provided definitions.
    """
    if not isinstance(schema, dict):
        return schema

    if "$ref" in schema:
        ref_path = schema["$ref"]
        ref_key = ref_path.split("/")[-1]
        resolved = definitions.get(ref_key, {})
        return resolve_schema_refs(resolved, definitions)

    if "items" in schema:
        schema["items"] = resolve_schema_refs(schema["items"], definitions)

    if "properties" in schema:
        for prop, val in schema["properties"].items():
            schema["properties"][prop] = resolve_schema_refs(val, definitions)

    if not schema or schema == {}:
        return {}

    return schema


def build_sample_payload(schema: dict) -> dict:
    fake = Faker()
    result = {}

    properties = schema.get("properties", {})

    for key, value in properties.items():
        if value.get("type") == "string" and value.get("format") == "binary":
            result[key] = "/path/to/cat.jpg"

        elif value.get("type") == "string":
            if "enum" in value and value["enum"]:
                result[key] = value["enum"][0]
            elif "example" in value:
                result[key] = value["example"]
            else:
                result[key] = fake.word()
        elif value.get("type") == "integer":
            result[key] = fake.random_int()
        elif value.get("type") == "array":
            item = value.get("items", {})
            if item.get("type") == "string":
                result[key] = [fake.word()]
            elif item.get("type") == "object":
                result[key] = [build_sample_payload(item)]
        elif value.get("type") == "object":
            result[key] = build_sample_payload(value)
        else:
            result[key] = None

    return result
