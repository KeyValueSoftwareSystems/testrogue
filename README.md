# TestRogue

**TestRogue** is a Flask-based web application that enables intelligent testing of APIs by leveraging Swagger/OpenAPI specifications and OpenAI. It automates test case generation, execution, and result exportation — all from a simple browser interface.

---

## 🚀 Features

- 🔍 **Extract Endpoints**: Parse Swagger/OpenAPI URLs to retrieve all available API endpoints.
- 🧠 **Generate Test Cases**: Use OpenAI to automatically generate test scenarios for each endpoint.
- ⚙️ **Execute Tests**: Run the generated test cases and view real-time results.
- 📥 **Download Results**: Export test cases and execution results as CSV files for sharing or analysis.

---

## 📦 Requirements

- Python **3.8+**
- `pip` (Python package installer)
- OpenAI API Key

---

## 🔧 Setup Instructions

### 1. Clone the Repository

```bash
git clone git@bitbucket.org:keyvaluesoftwaresystems/api_ai_automation.git
cd api_ai_automation
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Create Environment Configuration

Create a `.env` file in the root of the project with the following content:

```env
OPENAI_API_KEY=your_openai_api_key
```

> 💡 Replace `your_openai_api_key` with your actual OpenAI API key.  
> ⚠️ The application will not start without this key.

### 4. Start the Application

```bash
python webapp.py
```

### 5. Access the Web Interface

Open your browser and go to:

```
http://127.0.0.1:5000
```

---

## 📁 Project Structure

```
api_ai_automation/
├── webapp.py               # Main entry point for the Flask app
├── requirements.txt        # Python dependencies
├── logs    
│   ├── api_test.log        # Application logs
├── static
│   ├── style.css           # CSS file for styling
│   ├── script.js           # JavaScript file for client-side logic
├── utils/
│   ├── utils.py            # Core logic for endpoint extraction, test generation & execution
│   ├── constants.py        # Global constants (e.g. default paths, config keys, prompts)
│   ├── llm_manager.py      # Manages interactions with the LLM for generating test cases
│   ├── models.py           # Dataclasses/models representing endpoints, test cases, etc.
├── templates/              # HTML templates for rendering the web interface
│   ├── index.html          # Main UI template for Swagger input & results
├── .env                    # Environment variables (e.g. API keys, secret tokens)
```

---

## 🔌 API Endpoints

| Endpoint                | Method | Description                              |
|-------------------------|--------|------------------------------------------|
| `/extract_endpoints`    | POST   | Extracts endpoints from Swagger URL      |
| `/generate_tests`       | POST   | Generates test cases for all endpoints   |
| `/generate_single_test` | POST   | Generates a test case for one endpoint   |
| `/execute_tests`        | POST   | Executes the generated test cases        |
| `/download_test_cases`  | POST   | Downloads test cases and results as CSV  |

---

## ✅ Pre-Execution Checklist

- [x] Python 3.8 or higher is installed
- [x] All dependencies are installed via `pip install -r requirements.txt`
- [x] `.env` file is created with a valid `OPENAI_API_KEY`
- [x] Port `5000` is available (or configured in `.env`)
