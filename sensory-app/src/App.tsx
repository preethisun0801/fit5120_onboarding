import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Options from "./pages/Options";
import Selected from "./pages/Selected";
import Way from "./pages/Way";
import Settings from "./pages/Settings";
import About from "./pages/About";
import Navbar from "./components/layout/Navbar";
import BottomTabBar from "./components/layout/BottomTabBar";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)]">
        <Navbar />
        <main className="flex-1 pt-0 md:pt-16 pb-16 md:pb-0">
          <Routes>
            <Route index element={<Home />} />
            <Route path="/Options" element={<Options />} />
            <Route path="/Selected" element={<Selected />} />
            <Route path="/Way" element={<Way />} />
            <Route path="/Settings" element={<Settings />} />
            <Route path="/About" element={<About />} />
          </Routes>
        </main>
        <BottomTabBar />
      </div>
    </BrowserRouter>
  );
}

export default App;