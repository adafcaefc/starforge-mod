'use client';

import React, { useEffect, useRef, useState } from "react";

interface ObjectSpritePreviewProps {
  objectId: string;
}

export function ObjectSpritePreview({ objectId }: ObjectSpritePreviewProps) {
  const [hasSprite, setHasSprite] = useState<boolean | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 32;
    canvas.width = size;
    canvas.height = size;

    const detailImg = document.createElement("img");
    const mainImg = document.createElement("img");

    let loadedCount = 0;
    let hasAnyImage = false;

    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount === 2) {
        ctx.clearRect(0, 0, size, size);

        if (mainImg.complete && mainImg.naturalWidth > 0) {
          ctx.drawImage(mainImg, 0, 0, size, size);
          hasAnyImage = true;
        }

        if (detailImg.complete && detailImg.naturalWidth > 0) {
          ctx.drawImage(detailImg, 0, 0, size, size);
          hasAnyImage = true;
        }

        setHasSprite(hasAnyImage);
      }
    };

    detailImg.onerror = checkLoaded;
    mainImg.onerror = checkLoaded;
    detailImg.onload = checkLoaded;
    mainImg.onload = checkLoaded;

    detailImg.src = `/gd/objects/detail/${objectId}.png`;
    mainImg.src = `/gd/objects/main/${objectId}.png`;
  }, [objectId]);

  if (hasSprite === false) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500 text-xl">
        ?
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={32}
      height={32}
      style={{ width: 32, height: 32 }}
      className="image-rendering-pixelated"
    />
  );
}
