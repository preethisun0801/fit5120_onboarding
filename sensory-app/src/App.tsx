import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Options from "./pages/Options";
import Selected from "./pages/Selected";
import Way from "./pages/Way";
import Settings from "./pages/Settings";
import About from "./pages/About";
import Navbar from "./components/layout/Navbar";

function App() {
  return (
    <BrowserRouter>
    <div className="min-h-screen flex flex-col">
      <Navbar></Navbar>
      <main>
      <Routes>
      <Route index element={<Home />}></Route>
      <Route path="/Options" element={<Options />}></Route>
      <Route path="/Selected" element={<Selected />}></Route>
      <Route path="/Way" element={<Way />}></Route>
      <Route path="/Settings" element={<Settings />}></Route>
      <Route path="/About" element={<About />}></Route>
    </Routes>
    </main>
    </div>
    
    </BrowserRouter>
  )
}

export default App
