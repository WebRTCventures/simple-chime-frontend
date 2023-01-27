export async function retrieveSpeechAnalysisAccessToken() {
  const response = await fetch("https://api.symbl.ai/oauth2/token:generate", {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "application",
      appId: "",
      appSecret: "",
    }),
  });
  const responseBody = await response.json();
  return responseBody.accessToken;
}

export async function retrieveSpeechAnalysisMembers(
  accessToken = window.accessToken,
  conversationId = window.conversationId
) {
  const response = await fetch(
    `https://api.symbl.ai/v1/conversations/${conversationId}/members`,
    {
      method: "get",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
    }
  );
  const responseBody = await response.json();
  return responseBody.accessToken;
}

export async function retrieveSpeechAnalysisTopics(
  accessToken = window.accessToken,
  conversationId = window.conversationId
) {
  const response = await fetch(
    `https://api.symbl.ai/v1/conversations/${conversationId}/topics?sentiment=true`,
    {
      method: "get",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
    }
  );
  const responseBody = await response.json();
  return responseBody.accessToken;
}
