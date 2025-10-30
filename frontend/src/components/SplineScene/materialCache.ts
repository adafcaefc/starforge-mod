import * as THREE from "three";
import { loadModel } from "./threeUtils";

// Cache structure: modelName -> opacity -> materials[]
type MaterialCache = Map<string, Map<number, THREE.Material[]>>;

const materialCache: MaterialCache = new Map();
const OPACITY_STEPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

/**
 * Extract and clone all materials from a scene
 */
function extractMaterials(scene: THREE.Group): THREE.Material[] {
  const materials: THREE.Material[] = [];
  
  scene.traverse((child: any) => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((mat: THREE.Material) => {
          materials.push(mat.clone());
        });
      } else {
        materials.push(child.material.clone());
      }
    }
  });
  
  return materials;
}

/**
 * Pre-cache materials for a specific model at different opacity levels
 */
async function cacheModelMaterials(modelName: string): Promise<void> {
  try {
    const modelPath = `/models/objects/${modelName}`;
    const scene = await loadModel(modelPath);
    
    // Create a map for this model
    const opacityMap = new Map<number, THREE.Material[]>();
    
    // Generate materials for each opacity level
    for (const opacity of OPACITY_STEPS) {
      const materials = extractMaterials(scene);
      
      // Configure each material for transparency
      materials.forEach((mat) => {
        mat.transparent = true;
        mat.opacity = opacity;
        mat.needsUpdate = true;
        
        // Optimize for transparency
        if (opacity < 1.0) {
          mat.depthWrite = false;
        }
      });
      
      opacityMap.set(opacity, materials);
    }
    
    materialCache.set(modelName, opacityMap);
    console.log(`Cached materials for ${modelName} at ${OPACITY_STEPS.length} opacity levels`);
  } catch (error) {
    console.error(`Failed to cache materials for ${modelName}:`, error);
  }
}

/**
 * Get cached materials for a model at a specific opacity level
 * Returns the closest pre-cached opacity level
 */
export function getCachedMaterials(modelName: string, opacity: number): THREE.Material[] | null {
  const opacityMap = materialCache.get(modelName);
  if (!opacityMap) {
    return null;
  }
  
  // Find the closest opacity level
  let closestOpacity = OPACITY_STEPS[0];
  let minDiff = Math.abs(opacity - closestOpacity);
  
  for (const cachedOpacity of OPACITY_STEPS) {
    const diff = Math.abs(opacity - cachedOpacity);
    if (diff < minDiff) {
      minDiff = diff;
      closestOpacity = cachedOpacity;
    }
  }
  
  const materials = opacityMap.get(closestOpacity);
  if (!materials) {
    return null;
  }
  
  // Return cached materials directly - materials can be safely shared across meshes
  // This eliminates expensive cloning operations during object creation
  return materials;
}

/**
 * Pre-cache materials for all models in the objects folder
 */
export async function preloadAllObjectMaterials(): Promise<void> {
  console.log('Starting material cache preload...');
  
  // List of all model files in the objects folder
  const modelFiles = [
    'box1.glb',
    'box2.glb',
    'box3.glb',
    'boxquestion.glb',
    'meteor1.glb',
    'meteor2.glb',
    'meteor3.glb',
  ];
  
  // Load materials for all models in parallel
  const promises = modelFiles.map(modelName => cacheModelMaterials(modelName));
  
  try {
    await Promise.all(promises);
    console.log(`Material cache complete! Cached ${modelFiles.length} models`);
  } catch (error) {
    console.error('Error during material cache preload:', error);
  }
}

/**
 * Check if materials are cached for a specific model
 */
export function isCached(modelName: string): boolean {
  return materialCache.has(modelName);
}

/**
 * Clear the entire material cache (for cleanup)
 */
export function clearMaterialCache(): void {
  materialCache.forEach((opacityMap) => {
    opacityMap.forEach((materials) => {
      materials.forEach((mat) => mat.dispose());
    });
  });
  materialCache.clear();
  console.log('Material cache cleared');
}
