 let currentEndpoints = [];  // store current endpoints globally
  let extractedDefinitions = {};
  let allGeneratedTestCases = {}; // Store test cases grouped by endpoint path-method

  async function extractEndpoints() {
    const url = document.getElementById('swaggerUrl').value;
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = "<p class='loading'>Loading...</p>";
    allGeneratedTestCases = {}; // Clear previous test cases on new extraction

      // Basic validation for JSON file extension
    if (!url.toLowerCase().endsWith('.json')) {
        resultsDiv.innerHTML = "<p class='error'>Error: Only JSON Swagger files are supported. Please ensure swagger json path is given.</p>";
        return; // Stop the function execution
    }
    try {
      const response = await fetch('/extract_endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swagger_url: url })
      });
      console.log("Response status:", response); // Log the response status for debugging
      if (!response.ok) throw new Error("Failed to extract endpoints. Kindly make sure the swagger is 2.0 and URL is correct");
      const data = await response.json();
      console.log("Extracted data:", data); // Log the extracted data for debugging
      console.log("Extracted data swagger:", data.swagger); // Log the extracted data for debugging

      currentEndpoints = data.endpoints;  // store endpoints globally
      extractedDefinitions = data.definitions || {};

      // Update bulk button text
      const generateAllBtn = document.getElementById('generateAllBtn');
      const executeAllBtn = document.getElementById('executeAllBtn');
      const downloadAllBtn = document.getElementById('downloadAllBtn'); // Get the new button
      if (currentEndpoints.length > 0) {
        generateAllBtn.textContent = `Generate Tests for All ${currentEndpoints.length} Endpoints`;
        executeAllBtn.textContent = `Execute Tests for All ${currentEndpoints.length} Endpoints`;
        downloadAllBtn.style.display = 'block'; // Show download button
      } else {
        downloadAllBtn.style.display = 'none'; // Hide if no endpoints
      }


      // Show search and bulk buttons only if endpoints found
      document.getElementById('searchBox').style.display = currentEndpoints.length ? 'block' : 'none';
      document.querySelector('.bulk-actions').style.display = currentEndpoints.length ? 'flex' : 'none'; // Use flex for button layout

      renderEndpoints(currentEndpoints, data.title || 'Endpoints');
    } catch (error) {
      resultsDiv.innerHTML = "<p class='error'>Error: " + error.message + "</p>";
      document.getElementById('searchBox').style.display = 'none';
      document.querySelector('.bulk-actions').style.display = 'none';
    }
  }

  function renderEndpoints(endpoints, title) {
    const resultsDiv = document.getElementById('results');

    const html = endpoints.map(ep => `
      <div class="endpoint-card" id="card-${btoa(ep.path + ep.method).replace(/=/g, '')}" data-path="${ep.path.toLowerCase()}" data-method="${ep.method.toLowerCase()}">
        <div class="endpoint-info">
          <span class="method ${ep.method.toLowerCase()}">${ep.method.toUpperCase()}</span> <span class="path">${ep.path}</span>
        </div>
        <div class="test-cases-section" id="test-cases-${btoa(ep.path + ep.method).replace(/=/g, '')}">
          </div>
      </div>
    `).join('');

    resultsDiv.innerHTML = `
     <div id="overallTestResults" style="margin-top:20px;"></div>
      <div class="results-header">
        <h2>${title}</h2>
        <p>${endpoints.length} endpoints extracted</p>
      </div>
      <div class="endpoints-list">${html}</div>

    `;
  }

  // Filter endpoints by path matching search box value
  function filterEndpoints() {
    const filter = document.getElementById('searchBox').value.toLowerCase();
    const cards = document.querySelectorAll('.endpoint-card');
    cards.forEach(card => {
      const path = card.getAttribute('data-path');
      if (path.includes(filter)) {
        card.style.display = 'flex'; // Use flex to maintain layout
      } else {
        card.style.display = 'none';
      }
    });
  }

  function getEndpointCardId(path, method) {
    return `card-${btoa(path + method).replace(/=/g, '')}`;
  }

  function getTestCasesSectionId(path, method) {
    return `test-cases-${btoa(path + method).replace(/=/g, '')}`;
  }

  async function generateTestForEndpoint(path, method, button) {
    const sectionId = getTestCasesSectionId(path, method);
    const testCasesSection = document.getElementById(sectionId);
    button.disabled = true;
    button.textContent = 'Generating...';
    testCasesSection.innerHTML = "<p class='loading'>Generating test cases...</p>"; // Show loading
    testCasesSection.style.display = 'block'; // Show the section

    try {
      const endpoint = currentEndpoints.find(ep => ep.path === path && ep.method === method);
      if (!endpoint) {
        throw new Error("Endpoint not found in current data.");
      }

      const response = await fetch('/generate_single_test', { // New Flask endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpoint })
      });

      if (!response.ok) throw new Error(`Failed to generate test cases for ${method} ${path}`);
      const data = await response.json();
      const generatedTests = data.test_cases || [];

      // Store generated test cases
      allGeneratedTestCases[`${path}-${method}`] = generatedTests;

      renderTestCases(generatedTests, testCasesSection);
      button.textContent = 'Generate Test Cases';
      button.disabled = false;
    } catch (error) {
      testCasesSection.innerHTML = `<p class='error'>Error generating test cases: ${error.message}</p>`;
      button.textContent = 'Generate Test Cases';
      button.disabled = false;
    }
  }

  async function executeTestForEndpoint(path, method, button) {
    const sectionId = getTestCasesSectionId(path, method);
    const testCasesSection = document.getElementById(sectionId);
    button.disabled = true;
    button.textContent = 'Executing...';
    testCasesSection.style.display = 'block'; // Ensure section is visible

    try {
      const generatedTests = allGeneratedTestCases[`${path}-${method}`];
      if (!generatedTests || generatedTests.length === 0) {
        testCasesSection.innerHTML = "<p class='error'>Please generate test cases first before executing.</p>";
        button.textContent = 'Execute Tests';
        button.disabled = false;
        return; // Stop execution if no tests
      }

      // Show a loading message while executing
      testCasesSection.innerHTML = "<p class='loading'>Executing tests for this endpoint...</p>";


      const response = await fetch('/execute_tests', { // Can reuse existing /execute_tests
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_cases: generatedTests })
      });

      if (!response.ok) throw new Error(`Failed to execute test cases for ${method} ${path}`);
      const data = await response.json(); // This data contains summary and individual test results

      // Pass only the individual test case results relevant to this endpoint
      const individualResults = {};
      // Filter out the summary from data before passing to renderTestResults
      for (const key in data) {
          if (key !== 'summary') {
              individualResults[key] = data[key];
          }
      }

      renderTestResults(generatedTests, individualResults, testCasesSection); // Pass only individual results
      button.textContent = 'Execute Tests';
      button.disabled = false;
    } catch (error) {
      testCasesSection.innerHTML = `<p class='error'>Error executing tests: ${error.message}</p>`;
      button.textContent = 'Execute Tests';
      button.disabled = false;
    }
  }

  function renderTestCases(testCases, targetElement) {
    if (!testCases || testCases.length === 0) {
      targetElement.innerHTML = "<p class='info'>No test cases generated for this endpoint.</p>";
      return;
    }
    const html = testCases.map(tc => `
      <div class="test-case-card">
        <h4>${tc['Test Case Name'] || 'Unnamed Test Case'}</h4>
        <p><strong>Description:</strong> ${tc['Description'] || 'N/A'}</p>
        <p><strong>Endpoint:</strong> ${tc['Endpoint'] || 'N/A'}</p>
        <p><strong>Method:</strong> ${tc['Method'] || 'N/A'}</p>
        <p><strong>Expected Status:</strong> ${tc['Expected Status Code'] || 'N/A'}</p>
        ${tc['Request Body'] && Object.keys(tc['Request Body']).length > 0 ? `
          <p><strong>Request Body:</strong></p><pre>${JSON.stringify(tc['Request Body'], null, 2)}</pre>` : ''}
        ${tc['Headers'] && Object.keys(tc['Headers']).length > 0 ? `
          <p><strong>Headers:</strong></p><pre>${JSON.stringify(tc['Headers'], null, 2)}</pre>` : ''}
      </div>
    `).join('');
    targetElement.innerHTML = `<h3>Generated Test Cases (${testCases.length})</h3>${html}`;
  }


  function renderTestResults(testCases, individualResults, targetElement) { // Renamed resultsData to individualResults for clarity
    if (!testCases || testCases.length === 0) {
      targetElement.innerHTML = "<p class='info'>No test cases to display results for.</p>";
      return;
    }

    const testCaseHtml = testCases.map(tc => {
      const tcName = tc['Test Case Name'];
      const result = individualResults[tcName]; // Get result for this specific test case
      let statusClass = '';
      let statusText = 'Not Executed';
      let errorInfo = '';
      let actualStatusCode = '';
      let responseTimeInfo = '';
      let actualResponseContent = ''; // Variable for the actual response body

      if (result) {
        statusText = result.status;
        statusClass = result.status.toLowerCase();
        if (result.error) {
          errorInfo = `<p class='error'><strong>Error:</strong> ${result.error}</p>`;
        }
        if (result.actual_status_code) {
          actualStatusCode = `<p><strong>Actual Status:</strong> ${result.actual_status_code}</p>`;
        }
        if (result.response_time) {
          responseTimeInfo = `<p><strong>Response Time:</strong> ${result.response_time.toFixed(4)}s</p>`;
        }
        // Capture and format actual response body
        if (result.actual_response_body !== undefined && result.actual_response_body !== null) {
            try {
                // Try to pretty-print JSON responses
                actualResponseContent = JSON.stringify(result.actual_response_body, null, 2);
            } catch (e) {
                // If not JSON, just display as plain text
                actualResponseContent = String(result.actual_response_body);
            }
        }
      }

      // Generate a unique ID for the expandable content of this test case
      const contentId = `response-content-${btoa(tcName).replace(/=/g, '')}`;

      return `
        <div class="test-case-card">
          <span class="test-case-status ${statusClass}">${statusText}</span>
          <h4>${tcName || 'Unnamed Test Case'}</h4>
          <p><strong>Description:</strong> ${tc['Description'] || 'N/A'}</p>
          <p><strong>Endpoint:</strong> ${tc['Endpoint'] || 'N/A'}</p>
          <p><strong>Method:</strong> ${tc['Method'] || 'N/A'}</p>
          <p><strong>Expected Status:</strong> ${tc['Expected Status Code'] || 'N/A'}</p>
          ${actualStatusCode}
          ${responseTimeInfo}
          ${errorInfo}
          ${tc['Request Body'] && Object.keys(tc['Request Body']).length > 0 ? `
            <p><strong>Request Body:</strong></p><pre>${JSON.stringify(tc['Request Body'], null, 2)}</pre>` : ''}
          ${tc['Headers'] && Object.keys(tc['Headers']).length > 0 ? `
            <p><strong>Headers:</strong></p><pre>${JSON.stringify(tc['Headers'], null, 2)}</pre>` : ''}

          ${actualResponseContent ? `
            <button class="expand-collapse-btn" onclick="toggleResponseDisplay('${contentId}', this)" aria-expanded="false">
                <span>Show Actual Response</span> <span class="arrow">&#9660;</span>
            </button>
            <pre id="${contentId}" class="expandable-content"></pre>
          ` : ''}
        </div>
      `;
    }).join('');

    targetElement.innerHTML = `<h3>Test Execution Results (${testCases.length} test cases)</h3>${testCaseHtml}`;

    // After HTML is rendered, populate the pre tags for actual response content
    testCases.forEach(tc => {
        const tcName = tc['Test Case Name'];
        const result = individualResults[tcName];
        if (result && result.actual_response_body !== undefined && result.actual_response_body !== null) {
            const contentId = `response-content-${btoa(tcName).replace(/=/g, '')}`;
            const preElement = document.getElementById(contentId);
            if (preElement) {
                try {
                    preElement.textContent = JSON.stringify(result.actual_response_body, null, 2);
                } catch (e) {
                    preElement.textContent = String(result.actual_response_body);
                }
            }
        }
    });
  }

  // New JavaScript function for toggling display
  function toggleResponseDisplay(contentId, button) {
      const content = document.getElementById(contentId);
      const isExpanded = content.style.display === 'block';

      if (isExpanded) {
          content.style.display = 'none';
          button.setAttribute('aria-expanded', 'false');
      } else {
          content.style.display = 'block';
          button.setAttribute('aria-expanded', 'true');
      }
  }


  // Bulk generate test cases for all endpoints
  async function generateTestsForAll() {
    if (!currentEndpoints.length) {
      alert("No endpoints available");
      return;
    }

    const overallResultsDiv = document.getElementById('overallTestResults');
    overallResultsDiv.innerHTML = "<p class='loading'>Generating test cases for all endpoints...</p>";
    overallResultsDiv.style.display = 'block'; // Ensure overall results div is visible

    // Disable all individual generate/execute buttons and bulk buttons
    document.querySelectorAll('.btn-test, .btn-execute, #generateAllBtn, #executeAllBtn, #downloadAllBtn').forEach(btn => btn.disabled = true);


    try {
      const response = await fetch('/generate_tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoints: currentEndpoints, definitions: extractedDefinitions  })
      });

      if (!response.ok) throw new Error("Failed to generate test cases for all endpoints");
      const data = await response.json();
      const allTests = data.test_cases || [];

      // Clear previous individual test cases
      allGeneratedTestCases = {};

      // Distribute and render generated test cases to their respective sections
      currentEndpoints.forEach(ep => {
        const sectionId = getTestCasesSectionId(ep.path, ep.method);
        const testCasesSection = document.getElementById(sectionId);
        const swaggerPath = ep.path.replace(/{[^}]+}/g, '[^/]+');  // Convert to regex
        const pathRegex = new RegExp(`^${swaggerPath}$`);

        const generatedTestsForEndpoint = allTests.filter(
          tc => pathRegex.test(tc.Endpoint) && tc.Method.toLowerCase() === ep.method.toLowerCase() // Case-insensitive method check
        );

        allGeneratedTestCases[`${ep.path}-${ep.method}`] = generatedTestsForEndpoint; // Store for future execution

        renderTestCases(generatedTestsForEndpoint, testCasesSection);
        if (generatedTestsForEndpoint.length > 0) {
            testCasesSection.style.display = 'block'; // Show section if tests are generated
        } else {
            testCasesSection.innerHTML = `<p class='info'>No test cases generated for ${ep.method.toUpperCase()} ${ep.path}.</p>`; // Info message, capitalize method
            testCasesSection.style.display = 'block';
        }
      });

      overallResultsDiv.innerHTML = `<p class='success'>Successfully generated ${allTests.length} test cases across ${Object.keys(allGeneratedTestCases).length} endpoints.</p>`;

    } catch (error) {
      overallResultsDiv.innerHTML = "<p class='error'>Error: " + error.message + "</p>";
    } finally {
        // Re-enable buttons
        document.querySelectorAll('.btn-test, .btn-execute, #generateAllBtn, #executeAllBtn, #downloadAllBtn').forEach(btn => btn.disabled = false);
    }
  }

  // Bulk execute tests for all endpoints
  async function executeTestsForAll() {
    if (!currentEndpoints.length) {
      alert("No endpoints available");
      return;
    }

    const overallResultsDiv = document.getElementById('overallTestResults');
    overallResultsDiv.innerHTML = "<p class='loading'>Checking for generated test cases...</p>";
    overallResultsDiv.style.display = 'block'; // Show overall results div

    // Disable all individual generate/execute buttons and bulk buttons
    document.querySelectorAll('.btn-test, .btn-execute, #generateAllBtn, #executeAllBtn, #downloadAllBtn').forEach(btn => btn.disabled = true);


    let allTestsToExecute = [];
    let needToGenerateAll = false;

    // Check if all endpoints have generated test cases
    for (const ep of currentEndpoints) {
        const key = `${ep.path}-${ep.method}`;
        if (!allGeneratedTestCases[key] || allGeneratedTestCases[key].length === 0) {
            needToGenerateAll = true;
            break; // Found an endpoint without generated tests, need to generate all
        }
        allTestsToExecute = allTestsToExecute.concat(allGeneratedTestCases[key]);
    }

    if (needToGenerateAll) {
        overallResultsDiv.innerHTML = "<p class='warning'>Not all test cases are generated. Generating all test cases first...</p>";
        try {
            const genResponse = await fetch('/generate_tests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoints: currentEndpoints, definitions: extractedDefinitions }) // Pass definitions here too
            });

            if (!genResponse.ok) throw new Error("Failed to generate test cases before bulk execution");
            const genData = await genResponse.json();
            allTestsToExecute = genData.test_cases || [];

            // Distribute and render generated test cases to their respective sections
            allGeneratedTestCases = {}; // Clear existing
            currentEndpoints.forEach(ep => {
                const swaggerPath = ep.path.replace(/{[^}]+}/g, '[^/]+');  // Convert to regex
                const pathRegex = new RegExp(`^${swaggerPath}$`);
                const generatedTestsForEndpoint = allTestsToExecute.filter(tc => pathRegex.test(tc.Endpoint) && tc.Method.toLowerCase() === ep.method.toLowerCase());
                allGeneratedTestCases[`${ep.path}-${ep.method}`] = generatedTestsForEndpoint;

                const sectionId = getTestCasesSectionId(ep.path, ep.method);
                const testCasesSection = document.getElementById(sectionId);
                renderTestCases(generatedTestsForEndpoint, testCasesSection); // Render just the generated tests
                if (generatedTestsForEndpoint.length > 0) {
                    testCasesSection.style.display = 'block';
                } else {
                    testCasesSection.innerHTML = `<p class='info'>No test cases generated for ${ep.method.toUpperCase()} ${ep.path}.</p>`;
                    testCasesSection.style.display = 'block';
                }
            });

        } catch (error) {
            overallResultsDiv.innerHTML = "<p class='error'>Error during pre-execution generation: " + error.message + "</p>";
            document.querySelectorAll('.btn-test, .btn-execute, #generateAllBtn, #executeAllBtn, #downloadAllBtn').forEach(btn => btn.disabled = false);
            return;
        }
    } else {
        // If all tests are already generated, use them
        overallResultsDiv.innerHTML = "<p class='success'>All test cases are already generated. Proceeding to execution...</p>";
    }

    if (allTestsToExecute.length === 0) {
        overallResultsDiv.innerHTML = "<p class='error'>No test cases available to execute.</p>";
        document.querySelectorAll('.btn-test, .btn-execute, #generateAllBtn, #executeAllBtn, #downloadAllBtn').forEach(btn => btn.disabled = false);
        return;
    }

    overallResultsDiv.innerHTML += "<p class='loading'>Executing tests for all endpoints...</p>";

    try {
      const execResponse = await fetch('/execute_tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_cases: allTestsToExecute })
      });

      if (!execResponse.ok) throw new Error("Failed to execute test cases");
      const execData = await execResponse.json();

      // Render individual test results for each endpoint
      currentEndpoints.forEach(ep => {
        const sectionId = getTestCasesSectionId(ep.path, ep.method);
        const testCasesSection = document.getElementById(sectionId);
        const generatedTestsForEndpoint = allGeneratedTestCases[`${ep.path}-${ep.method}`] || [];

        // Filter execData to only include results for the current endpoint's test cases
        const individualResultsForEndpoint = {};
        generatedTestsForEndpoint.forEach(tc => {
            if (execData[tc['Test Case Name']]) {
                individualResultsForEndpoint[tc['Test Case Name']] = execData[tc['Test Case Name']];
            }
        });

        // Call renderTestResults with only the individual results for this endpoint
        renderTestResults(generatedTestsForEndpoint, individualResultsForEndpoint, testCasesSection);
        if (generatedTestsForEndpoint.length > 0) {
            testCasesSection.style.display = 'block'; // Show section if tests were executed
        }
      });

      // Display overall summary separately at the overallTestResults div
      // Declare a variable to hold the chart instance globally or in a scope that allows it to be reused
      let myPieChart = null;
      if (execData.summary) {
        const overallResultsDiv = document.getElementById('overallTestResults');
        // Set display to flex on the main overallResultsDiv for the side-by-side layout
        overallResultsDiv.style.display = 'flex';
        overallResultsDiv.style.flexWrap = 'wrap'; // Allow content to wrap on smaller screens
        overallResultsDiv.style.justifyContent = 'space-between'; // Space out the header and content
        overallResultsDiv.style.alignItems = 'flex-start'; // Align content to the top

        const totalCases = execData.summary.total_cases || 0;
        const passedCases = execData.summary.passed_cases || 0;
        const failedCases = execData.summary.failed_cases || 0;
        const totalTime = execData.summary.total_time ? execData.summary.total_time.toFixed(4) + 's' : 'N/A';

        // Construct the HTML for the summary details and the chart container
        const summaryHtml = `
            <h3 style="color: #ecf0f1; font-family: 'Montserrat', sans-serif; font-size: 1.6em; margin-bottom: 25px; text-align: center; text-shadow: 0 2px 5px rgba(0,0,0,0.2); width: 100%;">Overall Test Execution Summary</h3>
            <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; width: 100%; gap: 20px;">
                <div style="flex: 1; min-width: 250px; padding-right: 10px; box-sizing: border-box;">
                    <p style="margin-bottom: 12px; color: #bdc3c7; font-size: 1.1em; display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);"><strong>Total Cases:</strong> ${totalCases}</p>
                    <p style="margin-bottom: 12px; color: #bdc3c7; font-size: 1.1em; display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);"><strong>Passed:</strong> <span style="color: #2ecc71; font-weight: bold;">${passedCases}</span></p>
                    <p style="margin-bottom: 12px; color: #bdc3c7; font-size: 1.1em; display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);"><strong>Failed:</strong> <span style="color: #e74c3c; font-weight: bold;">${failedCases}</span></p>
                    <p style="margin-bottom: 0; color: #bdc3c7; font-size: 1.1em; display: flex; justify-content: space-between; align-items: center; padding: 5px 0;"><strong>Total Time:</strong> ${totalTime}</p>
                </div>
                <div style="flex-shrink: 0; width: 300px; height: 300px; background-color: rgba(0, 0, 0, 0.15); border-radius: 8px; padding: 15px; box-sizing: border-box; display: flex; justify-content: center; align-items: center; margin-left: auto;">
                    <canvas id="summaryPieChart"></canvas>
                </div>
            </div>
        `;

        overallResultsDiv.innerHTML = summaryHtml;

        // Get the context of the canvas element we just created
        const ctx = document.getElementById('summaryPieChart').getContext('2d');

        // Destroy any existing chart instance to prevent issues if summary is updated multiple times
        if (myPieChart) {
            myPieChart.destroy();
        }

        // Create the pie chart
        myPieChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Passed', 'Failed'],
                datasets: [{
                    data: [passedCases, failedCases],
                    backgroundColor: [
                        '#2ecc71', // Green for Passed
                        '#e74c3c'  // Red for Failed
                    ],
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Set to false so we can control size with parent div
                plugins: {
                    legend: {
                        position: 'bottom', // Position the legend below the chart
                        labels: {
                            color: '#ecf0f1', // Light color for legend text to fit dark theme
                            font: {
                                size: 14
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    label += context.parsed;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    if (total > 0) {
                                      const percentage = (context.parsed / total * 100).toFixed(2);
                                      label += ` (${percentage}%)`;
                                    }
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });

    } else {
        // If no summary data, display a message
        const overallResultsDiv = document.getElementById('overallTestResults');
        overallResultsDiv.style.display = 'block'; // Make sure the div is visible for the message
        overallResultsDiv.innerHTML = `<p class='success'>Execution completed. No overall summary available.</p>`;
    }


    } catch (error) {
      overallResultsDiv.innerHTML = "<p class='error'>Error: " + error.message + "</p>";
    } finally {
        // Re-enable buttons
        document.querySelectorAll('.btn-test, .btn-execute, #generateAllBtn, #executeAllBtn, #downloadAllBtn').forEach(btn => btn.disabled = false);
    }
  }

  // New function to download all generated test cases as CSV
  async function downloadAllTestCases() {
    if (Object.keys(allGeneratedTestCases).length === 0) {
      alert("No test cases have been generated yet. Please generate tests first.");
      return;
    }

    const overallResultsDiv = document.getElementById('overallTestResults');
    overallResultsDiv.innerHTML = "<p class='loading'>Preparing CSV for download...</p>";
    overallResultsDiv.style.display = 'block';

    try {
      // Flatten all generated test cases into a single array
      let allTests = [];
      for (const key in allGeneratedTestCases) {
        allTests = allTests.concat(allGeneratedTestCases[key]);
      }

      if (allTests.length === 0) {
        overallResultsDiv.innerHTML = "<p class='info'>No test cases found to download.</p>";
        return;
      }

      const response = await fetch('/download_test_cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_cases: allTests })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to download test cases: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Get the CSV data as a blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'all_test_cases.csv'; // Suggested filename
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      overallResultsDiv.innerHTML = "<p class='success'>Test cases downloaded successfully!</p>";

    } catch (error) {
      overallResultsDiv.innerHTML = `<p class='error'>Error downloading test cases: ${error.message}</p>`;
      console.error("Download error:", error);
    }
  }