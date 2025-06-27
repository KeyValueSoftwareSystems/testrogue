from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, make_response

from utils.constants import DEFAULT_MODEL
from utils.llm_manager import LLMManager
from utils.models import Endpoint
from utils.utils import extract_endpoints_from_swagger, generate_test_cases, execute_test_cases
import os
import csv
from io import StringIO
import json

app = Flask(__name__)
load_dotenv()

# Check for API key at startup
if not os.getenv("OPENAI_API_KEY"):
    raise ValueError("OPENAI_API_KEY environment variable not set. Please set it before running the application.")

llm = LLMManager.get_instance(DEFAULT_MODEL)

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/extract_endpoints', methods=['POST'])
def extract_endpoints():
    data = request.get_json()
    swagger_url = data.get("swagger_url")
    if not swagger_url:
        return jsonify({"error": "Swagger URL is required"}), 400

    extracted_data = extract_endpoints_from_swagger(swagger_url)
    if not extracted_data.endpoints:
        return jsonify({"error": "No endpoints found or error extracting from URL"}), 404

    return jsonify({
        "title": "Extracted Endpoints",
        "endpoints": [ep.model_dump(by_alias=True) for ep in extracted_data.endpoints],
        "definitions": extracted_data.definitions or {},
    })

@app.route('/generate_tests', methods=['POST'])
def generate_tests():
    data = request.get_json()
    endpoints = data.get("endpoints", [])
    definitions = data.get("definitions", {})
    if not endpoints:
        return jsonify({"error": "No endpoints provided"}), 400

    # Ensure endpoints is a list of dictionaries, even if it's just one
    if not isinstance(endpoints, list):
        endpoints = [endpoints]

    try:
        parsed_endpoints = [Endpoint(**ep) for ep in endpoints]
    except Exception as e:
        return jsonify({"error": f"Invalid endpoint data: {str(e)}"}), 400

    test_cases = generate_test_cases(parsed_endpoints, llm=llm, swagger_definitions=definitions)
    if not test_cases:
        return jsonify({"error": "Failed to generate any test cases"}), 500
    return jsonify({"test_cases": test_cases})

# NEW ROUTE for generating a single test case
@app.route('/generate_single_test', methods=['POST'])
def generate_single_test():
    data = request.get_json()
    endpoint = data.get("endpoint")
    definitions = data.get("definitions", {})
    parsed_endpoints = [Endpoint(**endpoint)]
    if not endpoint:
        return jsonify({"error": "No endpoint provided"}), 400

    # generate_test_cases expects a list, so wrap the single endpoint
    test_cases = generate_test_cases(parsed_endpoints, llm=llm, swagger_definitions=definitions)
    if not test_cases:
        return jsonify({"error": "Failed to generate test cases for the specified endpoint"}), 500
    return jsonify({"test_cases": test_cases})


@app.route('/execute_tests', methods=['POST'])
def execute_tests():
    data = request.get_json()
    test_cases = data.get("test_cases", [])
    if not test_cases:
        return jsonify({"error": "No test cases provided"}), 400

    results = execute_test_cases(test_cases)
    # The execute_test_cases function already returns a dictionary with summary and individual results
    return jsonify(results)

@app.route('/download_test_cases', methods=['POST'])
def download_test_cases():
    data = request.json
    test_cases = data.get('test_cases', [])

    if not test_cases:
        return jsonify({"error": "No test cases provided for download."}), 400

    # Define the CSV headers based on your test case structure
    # Ensure all possible keys are included here. Keys from generated tests + keys from execution results.
    headers = [
        "Test Case Name",
        "Description",
        "Endpoint",
        "Method",
        "Operation ID",
        "Summary",
        "Request Body",  # Will be stringified JSON
        "Expected Status Code",
        "Headers",  # Will be stringified JSON
        "Actual Status Code",  # From execution results
        "Status",  # From execution results (Passed/Failed/Error)
        "Error",  # From execution results
        "Response Time"  # From execution results
    ]

    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=headers)

    writer.writeheader()
    for tc in test_cases:
        row = {}
        for header in headers:
            # Get the value, default to empty string if not found
            value = tc.get(header, '')

            # Convert dicts (Request Body, Headers) to JSON strings for CSV
            if isinstance(value, dict):
                row[header] = json.dumps(value)
            # Convert float to string if it's Response Time
            elif header == "Response Time" and isinstance(value, (float, int)):
                row[header] = f"{value:.4f}"  # Format to 4 decimal places for consistency
            else:
                row[header] = value
        writer.writerow(row)

    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = "attachment; filename=all_test_cases.csv"
    response.headers["Content-type"] = "text/csv"
    return response

if __name__ == '__main__':
    # It's good practice to get the host from environment variables or default
    host = os.getenv('FLASK_RUN_HOST', '127.0.0.1')
    port = int(os.getenv('FLASK_RUN_PORT', 5000))
    app.run(debug=True, host=host, port=port)