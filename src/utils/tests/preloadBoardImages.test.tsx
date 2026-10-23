import { MantineProvider } from "@mantine/core";
import { COLORS, ROLES } from "chessops";
import { getDefaultStore } from "jotai";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import PreloadBoardImages from "@/components/boards/PreloadBoardImages";
import { Chessground } from "@/chessground/Chessground";
import { boardImageAtom, is3dAtom } from "@/state/atoms";

// chessground itself needs a laid-out page; only the board's box matters here
vi.mock("@lichess-org/chessground", () => ({
  Chessground: () => ({ set() {}, getFen: () => "", destroy() {} }),
}));

// The images decoded, by their path
const decoded: string[] = [];
let root: Root;

beforeAll(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      decode() {
        decoded.push(this.src);
        return Promise.resolve();
      }
    },
  );
});

beforeEach(() => {
  decoded.length = 0;
  root = createRoot(document.body.appendChild(document.createElement("div")));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

// The image a board draws its squares from
function boardImageDrawn() {
  const box = document.querySelector<HTMLElement>('[style*="--board-image"]');
  return box?.style.getPropertyValue("--board-image").match(/url\('(.*)'\)/)?.[1];
}

test.each([
  ["a flat board", false],
  ["a 3D board", true],
])("the image decoded at startup is the one %s is drawn from", async (_, is3d) => {
  getDefaultStore().set(boardImageAtom, "wood4.jpg");
  getDefaultStore().set(is3dAtom, is3d);
  await act(async () =>
    root.render(
      <MantineProvider>
        <PreloadBoardImages />
        <Chessground fen="8/8/8/8/8/8/8/8 w - - 0 1" />
      </MantineProvider>,
    ),
  );

  expect(boardImageDrawn()).toBeDefined();
  expect(decoded).toEqual([boardImageDrawn()]);
});

test("every piece is drawn once at startup, in both colours, as the piece sets select it", async () => {
  await act(async () => root.render(<PreloadBoardImages />));

  // A piece set's rules select a piece by both names (".pawn.white { ... }")
  for (const role of ROLES) {
    for (const color of COLORS) {
      expect(document.querySelector(`.${role}.${color}`), `${role} ${color}`).not.toBeNull();
    }
  }
});
