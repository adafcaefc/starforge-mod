export interface ObjectModelData {
  scaleX: number;
  scaleY: number;
  modelTextures: string[];
  shouldSpin?: boolean;
}

export type ObjectModelsMap = Record<string, ObjectModelData>;
