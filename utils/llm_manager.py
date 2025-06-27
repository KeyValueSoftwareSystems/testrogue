from typing import Union, List

from langchain_openai import ChatOpenAI, OpenAI
from utils.constants import SUPPORTED_MODELS, DEFAULT_MODEL


class LLMManager:
    _instance = None

    def __init__(self, model_name: str = DEFAULT_MODEL, temperature: float = 0.2):
        if model_name not in SUPPORTED_MODELS:
            raise ValueError(f"Unsupported model: {model_name}")

        config = SUPPORTED_MODELS[model_name]
        self.model_name = model_name
        self.model_type = config["type"]
        self.provider = config["provider"]
        self.max_tokens = config.get("max_tokens", 2048)

        # Initialize LLM
        if self.model_type == "chat":
            self.llm = ChatOpenAI(
                model=self.model_name,
                temperature=temperature,
                max_tokens=self.max_tokens
            )
        elif self.model_type == "completion":
            self.llm = OpenAI(
                model=self.model_name,
                temperature=temperature,
                max_tokens=self.max_tokens
            )
        else:
            raise NotImplementedError(f"Model type not supported: {self.model_type}")

    @classmethod
    def get_instance(cls, model_name=None, temperature=0.2):
        if cls._instance is None:
            cls._instance = cls(model_name, temperature)
        return cls._instance

    def generate_response(self, prompt: Union[str, List[str]]) -> Union[str, List[str]]:
        try:
            if self.model_type == "chat":
                response = self.llm.invoke(prompt)
                return response.content.strip()
            elif self.model_type == "completion":
                response = self.llm.generate([prompt])
                if not response.generations or not response.generations[0]:
                    raise ValueError("LLM returned an empty response.")
                return response.generations[0][0].text.strip()
            else:
                raise NotImplementedError("Response generation not implemented for this model type")
        except Exception as e:
            raise RuntimeError(f"Error during LLM generation: {str(e)}")
