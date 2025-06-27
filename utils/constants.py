import requests

SUPPORTED_MODELS = {
    "gpt-3.5-turbo": {
        "provider": "openai",
        "type": "chat",
        "max_tokens": 4096
    },
    "gpt-4.1-2025-04-14": {
        "provider": "openai",
        "type": "chat",
        "max_tokens": 2048
    },
    "text-davinci-003": {
        "provider": "openai",
        "type": "completion",
        "max_tokens": 4097
    }
}

DEFAULT_MODEL = "gpt-4.1-2025-04-14"

HTTP_METHODS = {
    "GET": requests.get,
    "POST": requests.post,
    "PUT": requests.put,
    "DELETE": requests.delete,
    "PATCH": requests.patch,
}