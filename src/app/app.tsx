import { withProviders } from "../providers";
import { Routing } from "../routing";
import "./app.css";

export default function App() {
  return withProviders(<Routing />);
}
