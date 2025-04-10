import { useState, useEffect } from "react";

export default function Chat() {
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);

  useEffect(() => {
    const savedNickname = localStorage.getItem("nickname");
    if (savedNickname) {
      setNickname(savedNickname);
    } else {
      window.location.href = "/"; // 如果没有昵称，返回首页
    }
  }, []);

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    const response = await fetch("https://your-backend.azurewebsites.net/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, message }),
    });

    const data = await response.json();
    setChatHistory([...chatHistory, { user: nickname, text: message }, { user: "Bot", text: data.reply }]);
    setMessage("");
  };

  return (
    <div>
      <h2>聊天界面 - 欢迎 {nickname}!</h2>
      <div>
        {chatHistory.map((msg, index) => (
          <p key={index}><strong>{msg.user}:</strong> {msg.text}</p>
        ))}
      </div>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="输入你的消息..."
      />
      <button onClick={handleSendMessage}>发送</button>
    </div>
  );
}
