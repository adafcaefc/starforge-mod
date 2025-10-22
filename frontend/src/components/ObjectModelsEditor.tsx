"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";

interface ObjectModelData {
  scaleX: number;
  scaleY: number;
  modelTextures: string[];
  shouldSpin?: boolean;
}

interface ObjectModelsMap {
  [objectId: string]: ObjectModelData;
}

interface ObjectModelsEditorProps {
  objectModelsDataRef: React.MutableRefObject<ObjectModelsMap>;
  onClose: () => void;
}

export default function ObjectModelsEditor({ objectModelsDataRef, onClose }: ObjectModelsEditorProps) {
  const [objectModels, setObjectModels] = useState<ObjectModelsMap>({});
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [availableGlbFiles, setAvailableGlbFiles] = useState<string[]>([]);
  const [objectIds, setObjectIds] = useState<number[]>([]);
  const [newObjectId, setNewObjectId] = useState("");
  const [spriteCache, setSpriteCache] = useState<{ [key: string]: string }>({});

  // Load available GLB files in the objects folder
  useEffect(() => {
    const loadGlbFiles = async () => {
      try {
        // For now, we'll list known GLB files
        // In a real implementation, you'd fetch this list from the server
        const glbFiles = [
          "box1.glb",
          "box2.glb",
          "box3.glb",
          "boxquestion.glb",
          "meteor1.glb",
          "meteor2.glb",
          "meteor3.glb",
        ];
        setAvailableGlbFiles(glbFiles);
      } catch (error) {
        console.error("Failed to load GLB files:", error);
      }
    };

    loadGlbFiles();
  }, []);

  // Load object models from the ref
  useEffect(() => {
    setObjectModels({ ...objectModelsDataRef.current });
    setObjectIds(Object.keys(objectModelsDataRef.current).map(Number).sort((a, b) => a - b));
  }, [objectModelsDataRef]);

  // Generate sprite preview by combining detail and main textures
  const generateSpritePreview = async (objectId: string): Promise<string> => {
    if (spriteCache[objectId]) {
      return spriteCache[objectId];
    }

    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve("");
        return;
      }

      // Load both detail and main textures
      const detailImg = document.createElement("img");
      const mainImg = document.createElement("img");
      
      let loadedCount = 0;
      const checkLoaded = () => {
        loadedCount++;
        if (loadedCount === 2) {
          // Draw main first, then detail on top
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Draw main texture
          if (mainImg.complete && mainImg.naturalWidth > 0) {
            ctx.drawImage(mainImg, 0, 0, canvas.width, canvas.height);
          }
          
          // Draw detail texture on top
          if (detailImg.complete && detailImg.naturalWidth > 0) {
            ctx.drawImage(detailImg, 0, 0, canvas.width, canvas.height);
          }
          
          const dataUrl = canvas.toDataURL();
          setSpriteCache((prev) => ({ ...prev, [objectId]: dataUrl }));
          resolve(dataUrl);
        }
      };

      detailImg.onerror = () => {
        console.log(`Detail texture not found for object ${objectId}`);
        checkLoaded();
      };
      mainImg.onerror = () => {
        console.log(`Main texture not found for object ${objectId}`);
        checkLoaded();
      };
      
      detailImg.onload = checkLoaded;
      mainImg.onload = checkLoaded;

      detailImg.src = `/gd/objects/detail/${objectId}.png`;
      mainImg.src = `/gd/objects/main/${objectId}.png`;
    });
  };

  // Save object models to the ref
  const saveObjectModels = () => {
    // Update the ref with current state
    objectModelsDataRef.current = { ...objectModels };
    alert("✅ Object models updated! Click 'Save to Level' in the spline editor to persist.");
    onClose();
  };

  // Add a new object model
  const addObjectModel = () => {
    const objectId = newObjectId.trim();
    if (!objectId || objectModels[objectId]) {
      alert("Please enter a valid unique object ID");
      return;
    }

    setObjectModels({
      ...objectModels,
      [objectId]: {
        scaleX: 1.0,
        scaleY: 1.0,
        modelTextures: [],
        shouldSpin: false,
      },
    });
    setObjectIds([...objectIds, parseInt(objectId)].sort((a, b) => a - b));
    setSelectedObjectId(objectId);
    setNewObjectId("");
  };

  // Delete an object model
  const deleteObjectModel = (objectId: string) => {
    if (!confirm(`Are you sure you want to delete object ${objectId}?`)) {
      return;
    }

    const newModels = { ...objectModels };
    delete newModels[objectId];
    setObjectModels(newModels);
    setObjectIds(objectIds.filter((id) => id !== parseInt(objectId)));
    if (selectedObjectId === objectId) {
      setSelectedObjectId(null);
    }
  };

  // Update a specific object model
  const updateObjectModel = (objectId: string, updates: Partial<ObjectModelData>) => {
    setObjectModels({
      ...objectModels,
      [objectId]: {
        ...objectModels[objectId],
        ...updates,
      },
    });
  };

  // Add a GLB file to the model textures
  const addModelTexture = (objectId: string, glbFile: string) => {
    const model = objectModels[objectId];
    if (!model.modelTextures.includes(glbFile)) {
      updateObjectModel(objectId, {
        modelTextures: [...model.modelTextures, glbFile],
      });
    }
  };

  // Remove a GLB file from the model textures
  const removeModelTexture = (objectId: string, glbFile: string) => {
    const model = objectModels[objectId];
    updateObjectModel(objectId, {
      modelTextures: model.modelTextures.filter((f) => f !== glbFile),
    });
  };

  const selectedModel = selectedObjectId ? objectModels[selectedObjectId] : null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl border border-gray-700 w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Object Models Editor</h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            ✕ Close
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Object List */}
          <div className="w-64 border-r border-gray-700 overflow-y-auto p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Object IDs</h3>
              <div className="flex gap-2 mb-2">
                <input
                  type="number"
                  value={newObjectId}
                  onChange={(e) => setNewObjectId(e.target.value)}
                  placeholder="Object ID"
                  className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      addObjectModel();
                    }
                  }}
                />
                <button
                  onClick={addObjectModel}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            <div className="space-y-1">
              {objectIds.map((id) => {
                const objectId = id.toString();
                const isSelected = selectedObjectId === objectId;
                return (
                  <div
                    key={objectId}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                    onClick={() => setSelectedObjectId(objectId)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <ObjectSprite objectId={objectId} />
                      <span className="text-sm font-mono">{objectId}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteObjectModel(objectId);
                      }}
                      className="p-1 hover:bg-red-600 rounded transition-colors text-xs"
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel - Object Details */}
          <div className="flex-1 overflow-y-auto p-6">
            {selectedModel && selectedObjectId ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Object ID: {selectedObjectId}
                  </h3>

                  {/* Sprite Preview */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Sprite Preview
                    </label>
                    <div className="w-32 h-32 bg-gray-800 border border-gray-600 rounded flex items-center justify-center">
                      <ObjectSprite objectId={selectedObjectId} size={96} />
                    </div>
                  </div>

                  {/* Scale Controls */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Scale X: {selectedModel.scaleX.toFixed(2)}
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="5"
                        step="0.1"
                        value={selectedModel.scaleX}
                        onChange={(e) =>
                          updateObjectModel(selectedObjectId, {
                            scaleX: parseFloat(e.target.value),
                          })
                        }
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Scale Y: {selectedModel.scaleY.toFixed(2)}
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="5"
                        step="0.1"
                        value={selectedModel.scaleY}
                        onChange={(e) =>
                          updateObjectModel(selectedObjectId, {
                            scaleY: parseFloat(e.target.value),
                          })
                        }
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Should Spin Checkbox */}
                  <div className="mb-6">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedModel.shouldSpin || false}
                        onChange={(e) =>
                          updateObjectModel(selectedObjectId, {
                            shouldSpin: e.target.checked,
                          })
                        }
                        className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
                      />
                      <span className="text-sm font-medium text-gray-300">
                        Enable Auto-Spin
                      </span>
                    </label>
                  </div>

                  {/* Model Textures (GLB Files) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      3D Models (GLB Files)
                      <span className="text-xs text-gray-500 ml-2">
                        - Selected at random if multiple
                      </span>
                    </label>

                    {/* Selected GLB Files */}
                    <div className="mb-3 space-y-2">
                      {selectedModel.modelTextures.length > 0 ? (
                        selectedModel.modelTextures.map((glbFile, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-gray-800 border border-gray-600 rounded"
                          >
                            <span className="text-sm text-white font-mono">{glbFile}</span>
                            <button
                              onClick={() => removeModelTexture(selectedObjectId, glbFile)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500 italic p-2">
                          No models assigned yet
                        </div>
                      )}
                    </div>

                    {/* Available GLB Files */}
                    <div className="border border-gray-600 rounded p-3 bg-gray-800">
                      <div className="text-xs text-gray-400 mb-2 font-semibold">
                        Available Models:
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                        {availableGlbFiles.map((glbFile) => {
                          const isSelected = selectedModel.modelTextures.includes(glbFile);
                          return (
                            <button
                              key={glbFile}
                              onClick={() => {
                                if (isSelected) {
                                  removeModelTexture(selectedObjectId, glbFile);
                                } else {
                                  addModelTexture(selectedObjectId, glbFile);
                                }
                              }}
                              className={`px-3 py-2 rounded text-sm font-mono transition-colors ${
                                isSelected
                                  ? "bg-green-600 hover:bg-green-700 text-white"
                                  : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                              }`}
                            >
                              {isSelected ? "✓ " : ""}
                              {glbFile}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select an object ID from the list or create a new one
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-700">
          <div className="text-sm text-gray-400">
            {Object.keys(objectModels).length} object(s) configured
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveObjectModels}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors"
            >
              💾 Save All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Component to display object sprite (combined detail + main)
function ObjectSprite({ objectId, size = 24 }: { objectId: string; size?: number }) {
  const [spriteUrl, setSpriteUrl] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;

    const detailImg = document.createElement("img");
    const mainImg = document.createElement("img");

    let loadedCount = 0;
    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount === 2) {
        ctx.clearRect(0, 0, size, size);

        // Draw main texture
        if (mainImg.complete && mainImg.naturalWidth > 0) {
          ctx.drawImage(mainImg, 0, 0, size, size);
        }

        // Draw detail texture on top
        if (detailImg.complete && detailImg.naturalWidth > 0) {
          ctx.drawImage(detailImg, 0, 0, size, size);
        }
      }
    };

    detailImg.onerror = checkLoaded;
    mainImg.onerror = checkLoaded;
    detailImg.onload = checkLoaded;
    mainImg.onload = checkLoaded;

    detailImg.src = `/gd/objects/detail/${objectId}.png`;
    mainImg.src = `/gd/objects/main/${objectId}.png`;
  }, [objectId, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="image-rendering-pixelated"
    />
  );
}
