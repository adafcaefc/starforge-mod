"use client";

import React, { useState } from "react";
import Link from "next/link";
import SpaceshipScene from "../../components/SpaceshipScene";

export default function SpaceshipPage() {
  const [isUIVisible, setIsUIVisible] = useState(true);

  return (
    <div className="w-full min-h-screen bg-black">
      {/* Toggle UI button */}
      <button
        onClick={() => setIsUIVisible(!isUIVisible)}
        className="fixed top-4 left-4 z-30 bg-black/70 hover:bg-black/90 text-white px-3 py-2 rounded-lg transition-colors"
        title={isUIVisible ? "Hide UI" : "Show UI"}
      >
        {isUIVisible ? "👁️ Hide UI" : "👁️‍🗨️ Show UI"}
      </button>

      {/* Navigation back to home */}
      {isUIVisible && (
        <nav className="fixed top-4 right-4 z-20">
          <Link
            href="/"
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            🏠 Home
          </Link>
        </nav>
      )}
      
      <SpaceshipScene isUIVisible={isUIVisible} />
    </div>
  );
}