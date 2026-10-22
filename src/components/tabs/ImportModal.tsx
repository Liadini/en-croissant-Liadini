import { Button, Checkbox, Modal, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { useLoaderData } from "@tanstack/react-router";
import { resolve, tempDir } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { makeFen, parseFen } from "chessops/fen";
import { useAtom, useStore } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import { commands } from "@/bindings";
import { addRecentFileAtom, currentTabAtom } from "@/state/atoms";
import { parsePGN } from "@/utils/chess";
import { chessopsError } from "@/utils/chessops";
import { createFile, openFile } from "@/utils/files";
import { getGameFromUrl } from "@/utils/import";
import { sortFileTypes } from "@/utils/sort";
import { isInTempDir, type Tab } from "@/utils/tabs";
import { defaultTree, getGameName } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";
import GameSourceInput, { type ImportType } from "../common/GameSourceInput";
import GenericCard from "../common/GenericCard";
import type { FileMetadata, FileType } from "../files/file";

const FILE_TYPES = [
  { label: "Files.FileType.Game", value: "game" },
  { label: "Files.FileType.Repertoire", value: "repertoire" },
  { label: "Files.FileType.Tournament", value: "tournament" },
  { label: "Files.FileType.Puzzle", value: "puzzle" },
  { label: "Files.FileType.Other", value: "other" },
] as const;

export default function ImportModal({
  openModal,
  setOpenModal,
  setTabs,
  setActiveTab,
}: {
  openModal: boolean;
  setOpenModal: React.Dispatch<React.SetStateAction<boolean>>;
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const { t } = useTranslation();

  return (
    <Modal
      opened={openModal}
      onClose={() => setOpenModal(false)}
      title={t("Home.Card.ImportGame.Title")}
    >
      <ImportGameForm setTabs={setTabs} setActiveTab={setActiveTab} />
    </Modal>
  );
}

// The Modal removes its content when it closes, so the dialog starts empty each time it opens
function ImportGameForm({
  setTabs,
  setActiveTab,
}: {
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const { t } = useTranslation();
  const [pgn, setPgn] = useState("");
  const [fen, setFen] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [importType, setImportType] = useState<ImportType>("PGN");
  const [filetype, setFiletype] = useState<FileType>("game");
  const [loading, setLoading] = useState(false);
  const [, setCurrentTab] = useAtom(currentTabAtom);
  const [fenError, setFenError] = useState("");
  const [linkError, setLinkError] = useState("");

  const [save, setSave] = useState(false);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const { documentDir } = useLoaderData({ from: "/" });
  const store = useStore();

  async function handleSubmit() {
    // Only a picked file fills the name in
    if (save && importType !== "FEN" && !filename.trim()) {
      setError(t("Common.RequireName"));
      return;
    }
    setLoading(true);
    if (importType === "PGN") {
      if (file || pgn) {
        if (file) {
          let fileInfo: FileMetadata | undefined;
          const count = unwrap(await commands.countPgnGames(file));
          const fileContent = await readTextFile(file);
          const input = unwrap(await commands.readGames(file, 0, 0))[0];
          if (save) {
            const newFile = await createFile({
              filename,
              filetype,
              pgn: fileContent,
              dir: documentDir,
            });
            if (newFile.isErr) {
              setError(newFile.error.message);
              setLoading(false);
              return;
            }
            fileInfo = newFile.value;
          } else {
            fileInfo = {
              type: "file",
              path: file,
              numGames: count,
              name: filename,
              lastModified: Date.now(),
              metadata: {
                type: "game",
                tags: [],
              },
            };
          }
          const tree = await parsePGN(input);
          const originKind = (await isInTempDir(fileInfo.path)) ? "temp_file" : "file";
          setCurrentTab((prev) => {
            sessionStorage.setItem(prev.value, JSON.stringify({ version: 0, state: tree }));
            return {
              ...prev,
              name: getGameName(tree.headers),
              gameOrigin: {
                kind: originKind,
                file: fileInfo,
                gameNumber: 0,
              },
              type: "analysis",
            };
          });

          if (fileInfo?.path) {
            store.set(addRecentFileAtom, {
              name: fileInfo.name,
              path: fileInfo.path,
              type: fileInfo.metadata.type,
            });
          }
        } else if (save) {
          const newFile = await createFile({
            filename,
            filetype,
            pgn,
            dir: documentDir,
          });
          if (newFile.isErr) {
            setError(newFile.error.message);
            setLoading(false);
            return;
          }
          await openFile(newFile.value, setTabs, setActiveTab);
        } else {
          const tempFile = await resolve(await tempDir(), `import_${Date.now()}.pgn`);
          await writeTextFile(tempFile, pgn);
          await openFile(tempFile, setTabs, setActiveTab);
        }
      }
    } else if (importType === "Link") {
      if (!link) {
        setLoading(false);
        return;
      }
      let pgn = "";
      try {
        pgn = await getGameFromUrl(link);
      } catch (e) {
        setLinkError(e instanceof Error ? e.message : String(e));
        setLoading(false);
        return;
      }
      setLinkError("");

      let fileInfo: FileMetadata | undefined;
      if (save) {
        const newFile = await createFile({
          filename,
          filetype,
          pgn,
          dir: documentDir,
        });
        if (newFile.isErr) {
          setError(newFile.error.message);
          setLoading(false);
          return;
        }
        fileInfo = newFile.value;
      }

      const tree = await parsePGN(pgn);
      setCurrentTab((prev) => {
        sessionStorage.setItem(prev.value, JSON.stringify({ version: 0, state: tree }));
        return {
          ...prev,
          name: getGameName(tree.headers),
          gameOrigin: fileInfo
            ? {
                kind: "file",
                file: fileInfo,
                gameNumber: 0,
              }
            : {
                kind: "none",
              },
          type: "analysis",
        };
      });

      if (fileInfo) {
        store.set(addRecentFileAtom, {
          name: fileInfo.name,
          path: fileInfo.path,
          type: fileInfo.metadata.type,
        });
      }
    } else if (importType === "FEN") {
      const res = parseFen(fen.trim());
      if (res.isErr) {
        setFenError(t(chessopsError(res.error)));
        setLoading(false);
        return;
      }
      setFenError("");
      const parsedFen = makeFen(res.value);
      setCurrentTab((prev) => {
        const tree = defaultTree(parsedFen);
        tree.headers.fen = parsedFen;
        sessionStorage.setItem(prev.value, JSON.stringify({ version: 0, state: tree }));
        return {
          ...prev,
          name: t("Home.Card.AnalysisBoard.Title"),
          gameOrigin: {
            kind: "none",
          },
          type: "analysis",
        };
      });
    }
    setLoading(false);
  }

  const disabled = match(importType)
    .with("PGN", () => !pgn && !file)
    .with("Link", () => !link)
    .with("FEN", () => !fen)
    .exhaustive();

  return (
    <>
      <GameSourceInput
        importType={importType}
        setImportType={setImportType}
        pgn={pgn}
        setPgn={setPgn}
        file={file}
        setFile={(file, name) => {
          setFile(file);
          setFilename(name);
        }}
        link={link}
        setLink={setLink}
        linkError={linkError}
        fen={{ value: fen, setValue: setFen, error: fenError }}
        onSubmit={handleSubmit}
      />

      {importType !== "FEN" && (
        <Stack mt="md">
          <Checkbox
            label={t("Import.SaveToCollection")}
            checked={save}
            onChange={(e) => setSave(e.currentTarget.checked)}
          />

          {save && (
            <>
              <TextInput
                label={t("Common.Name")}
                placeholder={t("Common.EnterFileName")}
                required
                value={filename}
                onChange={(e) => {
                  setFilename(e.currentTarget.value);
                  if (error) setError("");
                }}
                error={error}
              />

              <Text fz="sm" fw="bold">
                {t("Files.FileType")}
              </Text>

              <SimpleGrid cols={3}>
                {sortFileTypes(
                  FILE_TYPES,
                  (v) => v.value,
                  (v) => t(v.label),
                ).map((v) => (
                  <GenericCard
                    key={v.value}
                    id={v.value}
                    isSelected={filetype === v.value}
                    setSelected={setFiletype}
                    Header={<Text ta="center">{t(v.label)}</Text>}
                  />
                ))}
              </SimpleGrid>
            </>
          )}
        </Stack>
      )}

      <Button
        fullWidth
        mt="md"
        radius="md"
        loading={loading}
        disabled={disabled}
        onClick={handleSubmit}
      >
        {loading ? t("Import.Importing") : t("Home.Card.ImportGame.Button")}
      </Button>
    </>
  );
}
