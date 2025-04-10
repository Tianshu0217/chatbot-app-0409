import React, { useState, useEffect, useRef } from "react";
const isLocalhost = window.location.hostname === "localhost";
const BACKEND_URL = isLocalhost ? "http://localhost:5005" : "";


function App() {
    const [nickname, setNickname] = useState(localStorage.getItem("nickname") || "");
    const [tempNickname, setTempNickname] = useState("");
    const [message, setMessage] = useState("");
    const [chatHistory, setChatHistory] = useState([]);
    const inputRef = useRef(null);

    const urlParams = new URLSearchParams(window.location.search);
    const PHASE = parseInt(urlParams.get("phase")) || 1;
    const GROUPS = ["group1", "group2", "group3", "group4"];
    const GROUP_ID = PHASE === 2 
        ? (urlParams.get("group") || localStorage.getItem("group_id") || GROUPS[Math.floor(Math.random() * GROUPS.length)])
        : "normal";

    useEffect(() => {
        if (PHASE === 2 && !localStorage.getItem("group_id")) {
            localStorage.setItem("group_id", GROUP_ID);
        }
    }, [PHASE, GROUP_ID]);

    useEffect(() => {
        if (nickname) {
            fetch(`${BACKEND_URL}/api/load-history?nickname=${nickname}&group_id=${GROUP_ID}&phase=${PHASE}`)
                .then((res) => res.json())
                .then((data) => {
                    setChatHistory(data.chatHistory || []);
                })
                .catch((err) => console.error("❌ 加载聊天记录失败:", err));
        }
    }, [nickname, GROUP_ID, PHASE]);

    const handleSetNickname = () => {
        if (tempNickname.trim()) {
            setNickname(tempNickname);
            localStorage.setItem("nickname", tempNickname);
        } else {
            alert("Please nput valid experiment number！");
        }
    };

    const handleSendMessage = async () => {
        if (!message.trim()) return;

        const newChatHistory = [...chatHistory, { user: nickname, text: message }];
        setChatHistory(newChatHistory);
        setMessage("");

        try {
            const response = await fetch(`${BACKEND_URL}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nickname, message, group_id: GROUP_ID, phase: PHASE }),
            });

            const data = await response.json();
            setChatHistory(data.chatHistory);
            localStorage.setItem("chatHistory", JSON.stringify(data.chatHistory));
        } catch (error) {
            console.error("❌ API Error:", error);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <div style={{ padding: "20px", maxWidth: "600px", margin: "auto", fontFamily: "Arial, sans-serif" }}>
            <h1>Shopping Chatbot</h1>
            {!nickname ? (
                <div>
                    <input
                        type="text"
                        placeholder="input your experiment number"
                        value={tempNickname}
                        onChange={(e) => setTempNickname(e.target.value)}
                        ref={inputRef}
                        style={{ padding: "10px", width: "80%", fontSize: "16px", borderRadius: "8px", border: "1px solid #ccc" }}
                    />
                    <button onClick={handleSetNickname} style={{ padding: "10px 15px", marginLeft: "10px", borderRadius: "8px", background: "#007bff", color: "white", border: "none" }}>
                        confirm
                    </button>
                </div>
            ) : (
                <div>
                    <div
                        style={{
                            border: "1px solid #ccc",
                            padding: "10px",
                            borderRadius: "8px",
                            height: "600px",
                            overflowY: "auto",
                            marginBottom: "10px",
                            backgroundColor: "#f9f9f9"
                        }}
                    >
            {chatHistory.map((msg, index) => (
                <div
                    key={index}
                    style={{
                        display: "flex",
                        justifyContent: msg.user === "Bot" ? "flex-start" : "flex-end",
                        marginBottom: "10px"
                    }}
                >
                    <div>
                        {/* 发言人标签 */}
                        <div
                            style={{
                                fontSize: "12px",
                                marginBottom: "4px",
                                color: msg.user === "Bot" ? "#555" : "#0044cc",
                                textAlign: msg.user === "Bot" ? "left" : "right",
                                fontWeight: "bold"
                            }}
                        >
                            {msg.user === "Bot" ? "Shopping Chatbot" : nickname}
                    </div>

                        {/* 气泡内容 */}
                        <div
                            style={{
                                maxWidth: "80%",
                                padding: "10px",
                                borderRadius: "15px",
                                backgroundColor: msg.user === "Bot" ? "#e6e6e6" : "#007bff",
                                color: msg.user === "Bot" ? "black" : "white",
                                whiteSpace: "pre-wrap"
                            }}
                        >
                            {msg.text}
            </div>
        </div>
    </div>
))}

                </div>

                <div style={{ display: "flex", alignItems: "stretch" }}>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Input your message...（Enter:send，Shift+Enter:line feed）"
                        style={{ width: "80%", padding: "10px", borderRadius: "8px", fontSize: "16px", border: "1px solid #ccc" }}
                        rows={2}
                    />
                    <button onClick={handleSendMessage} style={{ padding: "20px 25px", marginLeft: "10px", borderRadius: "8px", background: "#007bff", color: "white", border: "none", fontSize:"16px" }}>
                        Send
                    </button>
                </div>
            </div>
            )}
        </div>
    );
}

export default App;