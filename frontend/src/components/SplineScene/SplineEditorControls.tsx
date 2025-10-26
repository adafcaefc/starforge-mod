'use client';

import React, { useEffect, useState } from "react";
import { Spline } from "./geometry";

interface SplineEditorControlsProps {
  onAddSegment: () => void;
  onRemoveSegment: () => void;
  onSaveSpline: () => void;
  onLoadSpline: () => void;
  onSaveToLevel: () => void;
  onOpenObjectModelsEditor: () => void;
  splineRef: React.MutableRefObject<Spline>;
}

export function SplineEditorControls({
  onAddSegment,
  onRemoveSegment,
  onSaveSpline,
  onLoadSpline,
  onSaveToLevel,
  onOpenObjectModelsEditor,
  splineRef,
}: SplineEditorControlsProps) {
  const [segmentCount, setSegmentCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSegmentCount(splineRef.current.segments.length);
    }, 250);
    return () => clearInterval(interval);
  }, [splineRef]);

  return (
    <div className="absolute top-4 left-4 bg-black/30 backdrop-blur-md p-4 rounded-lg shadow-lg border border-gray-700 z-10">
      <div className="flex flex-col gap-2">
        <button
          onClick={onAddSegment}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
        >
          Add Segment
        </button>
        <button
          onClick={onRemoveSegment}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-700"
          disabled={segmentCount <= 1}
        >
          Remove Segment
        </button>
        <div className="border-t border-gray-600 my-1"></div>
        <button
          onClick={onSaveSpline}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
        >
          Save to JSON
        </button>
        <button
          onClick={onLoadSpline}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
        >
          Load from JSON
        </button>
        <div className="border-t border-gray-600 pt-2 mt-1">
          <button
            onClick={onSaveToLevel}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
          >
            Save to Level
          </button>
        </div>
        <div className="border-t border-gray-600 pt-2 mt-1">
          <button
            onClick={onOpenObjectModelsEditor}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
          >
            Object Models Editor
          </button>
        </div>
      </div>
    </div>
  );
}
