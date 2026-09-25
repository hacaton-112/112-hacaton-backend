import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("Uncaught error in render tree:", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-lg font-semibold">Что-то пошло не так</h1>
        <p className="max-w-md text-sm text-gray-500">{error.message}</p>
        <button
          type="button"
          onClick={this.reset}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Попробовать снова
        </button>
      </div>
    );
  }
}
