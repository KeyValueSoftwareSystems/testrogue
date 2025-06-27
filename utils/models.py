# utils/models.py
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Union


class Parameter(BaseModel):
    name: str
    in_: str = Field(..., alias='in')
    description: Optional[str] = ""
    required: bool = False
    type: Optional[str] = ""
    format: Optional[str] = ""
    schema_data: Optional[Dict[str, Any]] = Field(None, alias="schema")
    enum: Optional[List[Any]] = []
    items: Optional[Dict[str, Any]] = {}

    model_config = ConfigDict(populate_by_name=True)  # <-- ✅ allows alias "in"


class RequestBody(BaseModel):
    required: bool = False
    schema_data: Optional[Dict[str, Any]] = Field(default_factory=dict, alias="schema")
    model_config = ConfigDict(populate_by_name=True)



class Response(BaseModel):
    description: str = ""
    schema_data: Optional[Dict[str, Any]] = Field(default_factory=dict, alias="schema")
    model_config = ConfigDict(populate_by_name=True)



class Endpoint(BaseModel):
    full_path: str
    path: str
    method: str
    operation_id: str
    summary: Optional[str] = ""
    description: Optional[str] = ""
    tags: List[str] = []
    parameters: List[Parameter] = []
    request_body: Optional[RequestBody] = RequestBody()
    responses: Dict[str, Response] = {}
    security: Optional[List[Dict[str, Any]]] = []


class ExtractedSwagger(BaseModel):
    endpoints: List[Endpoint]
    definitions: Dict[str, Any] = {}


class TestCase(BaseModel):
    Test_Case_Name: str = Field(..., alias="Test Case Name")
    Description: str
    Endpoint: str
    Method: str
    Operation_ID: Optional[str] = Field("", alias="Operation ID")
    Summary: Optional[str] = ""
    Request_Body: Union[Dict[str, Any], List[Dict[str, Any]]] = Field(default_factory=dict, alias="Request Body")
    Expected_Status_Code: int = Field(..., alias="Expected Status Code")
    Headers: Dict[str, Any] = Field(default_factory=dict)

    # You can also add execution fields:
    Actual_Status_Code: Optional[int] = Field(None, alias="Actual Status Code")
    Status: Optional[str] = None
    Error: Optional[str] = None
    Response_Time: Optional[float] = Field(None, alias="Response Time")
