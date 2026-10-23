import { COLORS, ROLES } from "chessops";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { boardImageAtom, is3dAtom } from "@/state/atoms";

// The board image is decoded and every piece drawn once, out of sight, as the app starts, so the
// session's first board is drawn whole: its squares and pieces aren't still loading when its
// coordinates (plain text) appear
function PreloadBoardImages() {
  const boardImage = useAtomValue(boardImageAtom);
  const is3d = useAtomValue(is3dAtom);

  useEffect(() => {
    const image = new Image();
    // The path Chessground draws the board from
    image.src = is3d ? `/board-3d/${boardImage}` : `/board/${boardImage}`;
    image.decode().catch(() => {});
  }, [boardImage, is3d]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 8,
        height: 8,
        opacity: 0.01,
        pointerEvents: "none",
        zIndex: -1,
      }}
    >
      {ROLES.flatMap((role) =>
        COLORS.map((color) => (
          <div
            key={role + color}
            className={`${role} ${color}`}
            style={{ position: "absolute", inset: 0, backgroundSize: "cover" }}
          />
        )),
      )}
    </div>
  );
}

export default PreloadBoardImages;
