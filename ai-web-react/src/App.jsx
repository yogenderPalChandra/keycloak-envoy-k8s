
import { useEffect, useState } from "react";
import "./App.css";
import keycloak from "./keycloak.js";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

function createChat() {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
  };
}

// code for postgres integration
const API_BASE = "http://localhost:8888";

async function apiFetch(path, options = {}) {
  await keycloak.updateToken(30);

  if (!keycloak.token) {
    throw new Error("No authentication token available.");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${keycloak.token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`API error (${response.status}): ${details}`);
  }

  if (response.status === 204) return null;

  return response.json();
}

//
function App() {

  function handleLogout() {
    // Remove locally stored chats before signing out.
    // localStorage.removeItem("ai-web-chats");
  
    // Sign out through Keycloak.
    keycloak.logout({
      redirectUri: window.location.origin,
    });
  }

  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [chatError, setChatError] = useState("");
  console.log("raw token:", keycloak.token);
  const activeChat = chats.find(
    (chat) => chat.id === activeChatId
  );
  useEffect(() => {
    let cancelled = false;
    async function loadChats() {
      try {
        const data = await apiFetch("/api/conversations");
  
        if (cancelled) return;
        const verifiedData = data || [];
        setChats(verifiedData);
        // setChats(data || []);
  
        // if (data.length > 0) {
        //   await openChat(data[0].id);
        // }
        if (verifiedData.length > 0) {
          await openChat(verifiedData[0].id);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load conversations:", error);
          setChatError(error.message);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingChats(false);
        }
      }
    }
  
    loadChats();
  
    return () => {
      cancelled = true;
    };
  }, []);

  async function openChat(chatId) {
    try {
      const conversation = await apiFetch(
        `/api/conversations/${chatId}`
      );
  
      setChats((previous) =>
        previous.map((chat) =>
          chat.id === chatId
            ? { ...conversation }
            : chat
        )
      );
  
      setActiveChatId(chatId);
      setInput("");
      setChatError("");
    } catch (error) {
      console.error("Failed to load conversation:", error);
      setChatError(error.message);
    }
  }

  async function newChat() {
    try {
      const conversation = await apiFetch(
        "/api/conversations",
        {
          method: "POST",
        }
      );
  
      const chat = {
        ...conversation,
        messages: [],
      };
  
      setChats((previous) => [chat, ...previous]);
      setActiveChatId(chat.id);
      setInput("");
      setChatError("");
    } catch (error) {
      console.error("Failed to create conversation:", error);
      setChatError(error.message);
    }
  }


  async function sendMessage(e) {
    console.log("SEND HANDLER CALLED");
    e.preventDefault();
    const text = input.trim();
  
    if (!text || isLoading || !activeChatId) return;
  
    setInput("");
    setIsLoading(true);
    setChatError("");
  
    try {
      await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: activeChatId,
          message: text,
        }),
      });
  
      // Reload messages from PostgreSQL

    // Fetch updated sidebar list and full conversation
    const [updatedChats, conversation] = await Promise.all([
      apiFetch("/api/conversations"),
      apiFetch(`/api/conversations/${activeChatId}`),
    ]);

    // Preserve the full conversation, including messages
    setChats(
      updatedChats.map((chat) =>
        chat.id === activeChatId ? conversation : chat
      )
    );

    setActiveChatId(activeChatId);
    } catch (error) {
      console.error("Failed to send message:", error);
      setChatError(error.message);
  
      // The backend may have saved the user message
      // even if Gemini failed. Reload to reflect DB state.
      await openChat(activeChatId);
    } finally {
      setIsLoading(false);
    }
  }
  

  async function deleteChat(chatId) {
    try {
      await apiFetch(`/api/conversations/${chatId}`, {
        method: "DELETE",
      });
  
      const remaining = chats.filter(
        (chat) => chat.id !== chatId
      );
  
      setChats(remaining);
  
      if (chatId === activeChatId) {
        if (remaining.length > 0) {
          await openChat(remaining[0].id);
        } else {
          setActiveChatId(null);
        }
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      setChatError(error.message);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">✦</div>
          <span>AI Workspace</span>
        </div>

        <button type="button" className="new-chat-button" onClick={newChat}>
          <span>＋</span> New chat
        </button>

        <div className="history-label">YOUR CHATS</div>
        {chatError && (<p className="error-message">{chatError}</p>)}

        <div className="chat-list">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${
                chat.id === activeChatId ? "active" : ""
              }`}
            >
              <button
                className="chat-select"
                onClick={() => openChat(chat.id)}
              >
                <span className="chat-icon">▤</span>
                <span className="chat-title">
                  {chat.title}
                </span>
              </button>

              <button
                className="delete-chat"
                title="Delete chat"
                aria-label={`Delete ${chat.title}`}
                onClick={() => deleteChat(chat.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="avatar">Y</div>
          <div>
            <div className="user-name">My workspace</div>
            <div className="user-status">Local development</div>
          </div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="mobile-brand">✦ AI Workspace</div>
          
          <div className="header-status-group">
            <div className="connection-status">
              <span className="status-dot" />
              Frontend preview
            </div>

            <button
              type="button"
              className="logout-button"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        </header>


        <section className="conversation">
        {(activeChat?.messages?.length ?? 0) === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">✦</div>
              <h1>What can I help you with?</h1>
              <p>
                Your AI workspace starts here.
                Ask a question to begin a conversation.
              </p>

              <div className="suggestions">
                <button
                  onClick={() =>
                    setInput("Explain how Kubernetes works")
                  }
                >
                  <span>⌘</span>
                  <strong>Learn something</strong>
                  <small>Explain a technical concept</small>
                </button>

                <button
                  onClick={() =>
                    setInput("Help me write a Python script")
                  }
                >
                  <span>{"</>"}</span>
                  <strong>Write some code</strong>
                  <small>Build or debug an application</small>
                </button>
              </div>
            </div>
          ) : (
            <div className="messages">
              {activeChat?.messages.map((message) => (
                <div className="message" key={message.id}>
                  <div className="message-avatar">
                    {message.role === "user" ? "Y" : "✦"}
                  </div>
                  <div className="message-content">
                    <div className="message-role">
                      {message.role === "user" ? "You" : "AI"}
                    </div>
                    <div className="markdown-content">
                      {message.role === "assistant" ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight]}
                        >
                          {message.content || ""}
                        </ReactMarkdown>
                      ) : (
                        <div className="user-message-text">
                          {message.content}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <p className="preview-notice">
                Messages are saved locally. AI responses will
                be connected in a later step.
              </p>
            </div>
          )}
        </section>


        <div className="composer-area">
        <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(e);
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form.requestSubmit();
                }
              }}
              placeholder={
                isLoading
                  ? "AI is thinking..."
                  : "Message AI Workspace..."
              }
              rows={1}
              aria-label="Message"
              disabled={isLoading}
            />

            <button
              className="send-button"
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label={isLoading ? "AI is thinking" : "Send message"}
            >
              {isLoading ? (
                <span className="loading-spinner" aria-hidden="true" />
              ) : (
                "↑"
              )}
            </button>
          </form>

          {isLoading && (
            <p className="loading-indicator" role="status">
              AI is thinking…
            </p>
          )}

          <p className="disclaimer">
            AI Workspace · Development environment
          </p>
        </div>
      </main>
    </div>

  );
}

export default App;
