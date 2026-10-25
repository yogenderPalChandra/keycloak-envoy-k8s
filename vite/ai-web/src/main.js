import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: "http://localhost:8080",
  realm: "ai-lab",
  clientId: "ai-web",
});

const status = document.getElementById("status");
const application = document.getElementById("application");
const result = document.getElementById("result");

async function start() {
  try {
    const authenticated = await keycloak.init({
      onLoad: "login-required",
      pkceMethod: "S256",
    });

    if (!authenticated) {
      status.textContent = "Login required.";
      return;
    }

    status.textContent =
      `Logged in as ${keycloak.tokenParsed.preferred_username}`;

    application.hidden = false;

    console.log("OIDC claims:", keycloak.tokenParsed);  
    console.log("raw token:", keycloak.token);          
  } catch (error) {
    console.error("Keycloak initialization failed:", error);
    status.textContent =
      "Login initialization failed. Check the browser console.";
  }
}

document.getElementById("ask").addEventListener("click", async () => {
  result.textContent = "Waiting for Gemini...";

  try {
    // Refresh the token if it expires soon.
    await keycloak.updateToken(30);

    const prompt = document.getElementById("prompt").value;

    const response = await fetch("http://localhost:8888/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keycloak.token}`,
      },
      body: JSON.stringify({ prompt }),
    });

    const body = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    result.textContent = body;
  } catch (error) {
    console.error(error);
    result.textContent = `Request failed: ${error.message}`;
  }
});

document.getElementById("logout").addEventListener("click", () => {
  keycloak.logout({
    redirectUri: window.location.origin + "/",
  });
});
start();