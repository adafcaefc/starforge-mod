'use client';

import React, { useState, useEffect, useRef } from "react";
import { ObjectModelData, ObjectModelsMap } from "@/types/objectModels";
import { ModelPreview } from "./ModelPreview";
import { ObjectSprite } from "./ObjectSprite";
import { ObjectSpritePreview } from "./ObjectSpritePreview";
import { ObjectModelsEditorProps, Toast } from "./types";

const API_BASE = "http://localhost:6673";

export default function ObjectModelsEditor({ objectModelsDataRef, splineRef, onClose, onSave }: ObjectModelsEditorProps) {
  const [objectModels, setObjectModels] = useState<ObjectModelsMap>({});
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [availableGlbFiles, setAvailableGlbFiles] = useState<string[]>([]);
  const [objectIds, setObjectIds] = useState<number[]>([]);
  const [newObjectId, setNewObjectId] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdCounter = useRef(0);
  const [selectedObjects, setSelectedObjects] = useState<Array<{ m_objectId: number }>>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownObjectIds, setDropdownObjectIds] = useState<number[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = toastIdCounter.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  useEffect(() => {
    const fetchSelectedObjects = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/gameobject/selected/get`);
        const data = await response.json();

        if (response.ok && data.status === 200) {
          const objects = data.message.selectedObjects || [];
          setSelectedObjects(objects);
        } else {
          setSelectedObjects([]);
        }
      } catch (error) {
        console.log("Failed to fetch selected objects:", error);
        setSelectedObjects([]);
      }
    };

    fetchSelectedObjects();
    const interval = setInterval(fetchSelectedObjects, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const inputNum = parseInt(newObjectId) || 0;

    if (selectedObjects.length > 0) {
      const uniqueSelectedIds = Array.from(new Set(selectedObjects.map((obj: any) => obj.m_objectId))) as number[];
      const selectedIds = uniqueSelectedIds.slice(0, 10);

      const baseId = inputNum > 0 ? inputNum : selectedIds[0] || 1;
      const nextIds: number[] = [];
      for (let i = 1; i <= 10; i++) {
        nextIds.push(baseId + i);
      }

      setDropdownObjectIds([...selectedIds, ...nextIds]);
    } else {
      const baseId = inputNum > 0 ? inputNum : 1;
      const ids: number[] = [];
      for (let i = 0; i < 10; i++) {
        ids.push(baseId + i);
      }
      setDropdownObjectIds(ids);
    }
  }, [selectedObjects, newObjectId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDropdown]);

  useEffect(() => {
    const loadGlbFiles = async () => {
      try {
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

  useEffect(() => {
    setObjectModels({ ...objectModelsDataRef.current });
    setObjectIds(Object.keys(objectModelsDataRef.current).map(Number).sort((a, b) => a - b));
  }, [objectModelsDataRef]);

  const saveObjectModels = async () => {
    objectModelsDataRef.current = { ...objectModels };

    try {
      const spline = splineRef.current;
      const levelData = {
        spline: {
          segments: spline.segments.map((segment: any) => ({
            p1: { x: segment.p1.x, y: segment.p1.y, z: segment.p1.z },
            m1: { x: segment.m1.x, y: segment.m1.y, z: segment.m1.z },
            m2: { x: segment.m2.x, y: segment.m2.y, z: segment.m2.z },
            p2: { x: segment.p2.x, y: segment.p2.y, z: segment.p2.z },
            p1NormalAngle: segment.p1NormalAngle,
            p2NormalAngle: segment.p2NormalAngle,
          })),
        },
        objectModels: objectModels,
      };

      const response = await fetch("http://localhost:6673/api/leveldata/load", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(levelData),
      });

      const result = await response.json();

      if (!response.ok || result.status !== 200) {
        throw new Error(result.message || "Failed to save level data");
      }

      showToast("Object models saved successfully!", "success");
      console.log("Object models saved to level");

      if (onSave) {
        onSave();
      }

      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      console.error("Failed to save to level:", error);
      showToast(`Failed to save to level: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    }
  };

  const addObjectModel = () => {
    const objectId = newObjectId.trim();
    if (!objectId || objectModels[objectId]) {
      showToast("Please enter a valid unique object ID", "error");
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

  const deleteObjectModel = (objectId: string) => {
    const newModels = { ...objectModels };
    delete newModels[objectId];
    setObjectModels(newModels);
    setObjectIds(objectIds.filter((id) => id !== parseInt(objectId)));
    if (selectedObjectId === objectId) {
      setSelectedObjectId(null);
    }
  };

  const updateObjectModel = (objectId: string, updates: Partial<ObjectModelData>) => {
    setObjectModels({
      ...objectModels,
      [objectId]: {
        ...objectModels[objectId],
        ...updates,
      },
    });
  };

  const addModelTexture = (objectId: string, glbFile: string) => {
    const model = objectModels[objectId];
    if (!model.modelTextures.includes(glbFile)) {
      updateObjectModel(objectId, {
        modelTextures: [...model.modelTextures, glbFile],
      });
    }
  };

  const removeModelTexture = (objectId: string, glbFile: string) => {
    const model = objectModels[objectId];
    updateObjectModel(objectId, {
      modelTextures: model.modelTextures.filter((f) => f !== glbFile),
    });
  };

  const selectedModel = selectedObjectId ? objectModels[selectedObjectId] : null;

  const renderDropdownItems = (ids: number[], highlightSelected: boolean) =>
    ids
      .filter((id) => id != null)
      .map((id) => {
        const idStr = String(id);
        const alreadyExists = !!objectModels[idStr];
        return (
          <button
            key={id}
            onClick={() => {
              setNewObjectId(idStr);
              setShowDropdown(false);
            }}
            disabled={alreadyExists}
            className={`w-full flex items-center gap-2 px-2 py-2 text-left transition-colors ${
              alreadyExists
                ? "opacity-50 cursor-not-allowed bg-gray-800"
                : "hover:bg-gray-700"
            } ${highlightSelected ? "bg-blue-900/20" : ""}`}
          >
            <div className="w-8 h-8 bg-gray-900 rounded border border-gray-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
              <ObjectSpritePreview objectId={idStr} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-white">{id}</span>
                {highlightSelected && <span className="text-xs text-blue-400">●</span>}
                {alreadyExists && <span className="text-xs text-gray-500">(exists)</span>}
              </div>
            </div>
          </button>
        );
      });

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl border border-gray-700 w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Object Models Editor</h2>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-lg font-bold"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-80 border-r border-gray-700 overflow-y-auto custom-scrollbar p-4 flex flex-col">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Object IDs</h3>
              <div className="flex gap-2 mb-2 relative" ref={dropdownRef}>
                <div className="flex-1 relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newObjectId}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, "");
                      setNewObjectId(value);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Object ID"
                    className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        addObjectModel();
                        setShowDropdown(false);
                      } else if (e.key === "Escape") {
                        setShowDropdown(false);
                      }
                    }}
                  />

                  {showDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg max-h-80 overflow-y-auto z-50">
                      {selectedObjects.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs text-blue-400 border-b border-gray-700 bg-gray-900/50 sticky top-0">
                            Selected in Editor ({Math.min(10, Array.from(new Set(selectedObjects.map((obj) => obj.m_objectId))).length)})
                          </div>
                          {renderDropdownItems(
                            dropdownObjectIds.slice(0, Math.min(10, Array.from(new Set(selectedObjects.map((obj) => obj.m_objectId))).length)),
                            true
                          )}
                          <div className="px-2 py-1 text-xs text-gray-400 border-b border-gray-700 bg-gray-900/50 sticky top-0">
                            Next Items
                          </div>
                        </>
                      )}
                      {renderDropdownItems(
                        dropdownObjectIds.slice(
                          selectedObjects.length > 0
                            ? Math.min(10, Array.from(new Set(selectedObjects.map((obj) => obj.m_objectId))).length)
                            : 0
                        ),
                        false
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    addObjectModel();
                    setShowDropdown(false);
                  }}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            <div className="space-y-1 flex-1 overflow-y-auto custom-scrollbar">
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
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <ObjectSprite objectId={objectId} />
                      <span className="text-sm font-mono truncate">{objectId}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteObjectModel(objectId);
                      }}
                      className="p-1 hover:bg-red-600 rounded transition-colors text-xs flex-shrink-0"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {selectedModel && selectedObjectId ? (
              <div className="flex flex-col h-full">
                <div className="flex-shrink-0">
                  <h3 className="text-lg font-semibold text-white mb-4">Object ID: {selectedObjectId}</h3>

                  <div className="flex gap-6 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Sprite Preview</label>
                      <div className="w-32 h-32 bg-gray-800 border border-gray-600 rounded flex items-center justify-center">
                        <ObjectSprite objectId={selectedObjectId} size={96} />
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className="space-y-4">
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
                        <div>
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
                            <span className="text-sm font-medium text-gray-300">Enable Auto-Spin</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                  <label className="block text-sm font-medium text-gray-300 mb-3 flex-shrink-0">
                    Available Models
                    <span className="block text-xs text-gray-500 mt-1">Selected at random if multiple</span>
                  </label>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {availableGlbFiles.map((glbFile) => {
                      const isSelectedTexture = selectedModel.modelTextures.includes(glbFile);
                      return (
                        <button
                          key={glbFile}
                          onClick={() => {
                            if (isSelectedTexture) {
                              removeModelTexture(selectedObjectId, glbFile);
                            } else {
                              addModelTexture(selectedObjectId, glbFile);
                            }
                          }}
                          className={`w-full flex items-center gap-3 p-3 rounded transition-colors border ${
                            isSelectedTexture
                              ? "bg-green-600 hover:bg-green-700 text-white border-green-500"
                              : "bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-600"
                          }`}
                        >
                          <div className="w-20 h-20 bg-gray-900 rounded border border-gray-700 flex-shrink-0">
                            <ModelPreview modelPath={`/models/objects/${glbFile}`} />
                          </div>
                          <div className="flex-1 text-left">
                            <div className="font-mono text-sm">{glbFile}</div>
                          </div>
                        </button>
                      );
                    })}
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

        <div className="flex items-center justify-end p-4 border-t border-gray-700">
          <div className="flex gap-2">
            <button
              onClick={saveObjectModels}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors"
            >
              Save All
            </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-4 right-4 z-[60] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg border backdrop-blur-sm animate-slide-in-right ${
              toast.type === "success"
                ? "bg-green-900/90 border-green-600 text-green-100"
                : toast.type === "error"
                ? "bg-red-900/90 border-red-600 text-red-100"
                : "bg-blue-900/90 border-blue-600 text-blue-100"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
