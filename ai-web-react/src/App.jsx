
import { useEffect, useState } from "react";
import "./App.css";
import keycloak from "./keycloak.js";

function createChat() {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
  };
}

function App() {
  const [chats, setChats] = useState(() => {
    try {
      const saved = localStorage.getItem("ai-web-chats");
      return saved ? JSON.parse(saved) : [createChat()];
    } catch {
      return [createChat()];
    }
  });

  function handleLogout() {
    // Remove locally stored chats before signing out.
    // localStorage.removeItem("ai-web-chats");
  
    // Sign out through Keycloak.
    keycloak.logout({
      redirectUri: window.location.origin,
    });
  }

  const [activeChatId, setActiveChatId] = useState(
    () => chats[0]?.id
  );

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const activeChat = chats.find(
    (chat) => chat.id === activeChatId
  );

  useEffect(() => {
    localStorage.setItem("ai-web-chats", JSON.stringify(chats));
  }, [chats]);

  function newChat() {
    const chat = createChat();
    setChats((previous) => [chat, ...previous]);
    setActiveChatId(chat.id);
    setInput("");
  }


  async function sendMessage(event) {
    event.preventDefault();
  
    const text = input.trim();
    if (!text) return;

    if (isLoading) return;
    setIsLoading(true);
  
    // Remember which chat this message belongs to.
    const chatId = activeChatId;
    const previousMessages =
      chats.find((chat) => chat.id === chatId)?.messages ?? [];
  
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
  
    // Immediately show the user's message.
    setChats((previous) =>
      previous.map((chat) => {
        if (chat.id !== chatId) return chat;
  
        return {
          ...chat,
          title:
            chat.messages.length === 0
              ? text.slice(0, 32)
              : chat.title,
          messages: [...chat.messages, userMessage],
        };
      })
    );
  
    setInput("");
  
    try {
      // Refresh the token if it is about to expire.
      await keycloak.updateToken(30);
  
      if (!keycloak.token) {
        throw new Error("No authentication token available.");
      }
  
      // Send the prompt to our existing backend through Envoy.
      const response = await fetch(
        "http://localhost:8888/api/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keycloak.token}`,
          },
          body: JSON.stringify({
            messages: [
              ...previousMessages.map(({ role, content }) => ({
                role,
                content,
              })),
              {
                role: "user",
                content: text,
              },
            ],
          }),
        }
      );
  
      if (!response.ok) {
        const details = await response.text();
        throw new Error(
          `API request failed (${response.status}): ${details}`
        );
      }
  
      const data = await response.json();
  
      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
      };
  
      // Add the AI response to the same chat.
      setChats((previous) =>
        previous.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...chat.messages, assistantMessage],
              }
            : chat
        )
      );
    } catch (error) {
      console.error("Failed to send chat message:", error);
  
      const errorMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Sorry, the request failed: ${error.message}`,
      };
  
      setChats((previous) =>
        previous.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...chat.messages, errorMessage],
              }
            : chat
        )
      );
    } finally {
      setIsLoading(false);
    }
  }
  

  function deleteChat(chatId) {
    const remaining = chats.filter(
      (chat) => chat.id !== chatId
    );

    if (remaining.length === 0) {
      const chat = createChat();
      setChats([chat]);
      setActiveChatId(chat.id);
      return;
    }

    setChats(remaining);

    if (chatId === activeChatId) {
      setActiveChatId(remaining[0].id);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">✦</div>
          <span>AI Workspace</span>
        </div>

        <button className="new-chat-button" onClick={newChat}>
          <span>＋</span> New chat
        </button>

        <div className="history-label">YOUR CHATS</div>

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
                onClick={() => setActiveChatId(chat.id)}
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
          {activeChat?.messages.length === 0 ? (
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
                    <div>{message.content}</div>
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
          <form className="composer" onSubmit={sendMessage}>
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
