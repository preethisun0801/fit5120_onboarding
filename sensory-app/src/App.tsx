import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Options from "./pages/Options";
import Selected from "./pages/Selected";
import Way from "./pages/Way";


function App() {
  return (
    <BrowserRouter>
    <Routes>
      <Route index element={<Home />}></Route>
      <Route path="/Options" element={<Options />}></Route>
      <Route path="/Selected" element={<Selected />}></Route>
      <Route path="/Way" element={<Way />}></Route>
    </Routes>
    </BrowserRouter>
  )
}

export default App
