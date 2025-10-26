import React from "react";
import { ObjectModelsMap } from "@/types/objectModels";

export interface ObjectModelsEditorProps {
  objectModelsDataRef: React.MutableRefObject<ObjectModelsMap>;
  splineRef: React.MutableRefObject<any>;
  onClose: () => void;
  onSave?: () => void;
}

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}
