import { withRootProviders } from "../providers";
import { Routing } from "../routing";

export default function App() {
  return withRootProviders(<Routing />);
}
