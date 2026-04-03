import { Component } from "react";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
      stack: ""
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: String(error?.message || "Something went wrong")
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[AppErrorBoundary]", error, errorInfo);
    this.setState({
      stack: String(errorInfo?.componentStack || "")
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#101114", padding: 16 }}>
          <div style={{ maxWidth: 780, width: "100%", background: "#1a1d23", color: "#fff", border: "1px solid #2c3240", borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Something went wrong on this page</h2>
            <p style={{ color: "#ffd2d8", fontWeight: 700 }}>{this.state.message}</p>
            {this.state.stack && (
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#0f1218", border: "1px solid #2a2f3a", borderRadius: 8, padding: 12, overflow: "auto" }}>
                {this.state.stack}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              style={{ marginTop: 10, border: "none", borderRadius: 8, background: "#ff6b00", color: "#fff", fontWeight: 700, padding: "10px 14px", cursor: "pointer" }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
