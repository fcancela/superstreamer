import { execa } from "execa";
import { lookup } from "mime-types";
import parseFilePath from "parse-filepath";
import { downloadFolder, uploadFolder } from "../s3";
import { getMeta } from "../meta";
import { getBinaryPath } from "../helpers";
import type { WorkerCallback } from "../lib/worker-processor";
import type { Stream } from "../../types";

const packagerBin = await getBinaryPath("packager");

export type PackageData = {
  assetId: string;
  segmentSize?: number;
  name: string;
  tag?: string;
};

export type PackageResult = {
  assetId: string;
};

export const packageCallback: WorkerCallback<
  PackageData,
  PackageResult
> = async ({ job, tmpDir }) => {
  const inDir = await tmpDir.create();
  await downloadFolder(`transcode/${job.data.assetId}`, inDir);

  job.log(`Synced folder in ${inDir}`);

  const meta = await getMeta(inDir);

  job.log(`Got meta: "${JSON.stringify(meta)}"`);

  // If we do not specify the segmentSize, grab it from the meta file.
  const segmentSize = job.data.segmentSize ?? meta.segmentSize;

  const outDir = await tmpDir.create();

  const packagerParams: string[][] = [];

  for (const key of Object.keys(meta.streams)) {
    const stream = meta.streams[key];
    const file = parseFilePath(key);

    if (stream.type === "video") {
      packagerParams.push([
        `in=${inDir}/${key}`,
        "stream=video",
        `init_segment=${file.name}/init.mp4`,
        `segment_template=${file.name}/$Number$.m4s`,
        `playlist_name=${file.name}/playlist.m3u8`,
        `iframe_playlist_name=${file.name}/iframe.m3u8`,
      ]);
    }

    if (stream.type === "audio") {
      packagerParams.push([
        `in=${inDir}/${key}`,
        "stream=audio",
        `init_segment=${file.name}/init.mp4`,
        `segment_template=${file.name}/$Number$.m4a`,
        `playlist_name=${file.name}/playlist.m3u8`,
        `hls_group_id=${getGroupId(stream)}`,
        `hls_name=${getName(stream)}`,
        `language=${stream.language}`,
      ]);
    }

    if (stream.type === "text") {
      packagerParams.push([
        `in=${inDir}/${key}`,
        "stream=text",
        `segment_template=${file.name}/$Number$.vtt`,
        `playlist_name=${file.name}/playlist.m3u8`,
        `hls_group_id=${getGroupId(stream)}`,
        `hls_name=${getName(stream)}`,
        `language=${stream.language}`,
      ]);
    }
  }

  const packagerArgs = packagerParams.map((it) => `${it.join(",")}`);

  packagerArgs.push(
    "--segment_duration",
    segmentSize.toString(),
    "--fragment_duration",
    segmentSize.toString(),
    "--hls_master_playlist_output",
    "master.m3u8",
  );

  job.log(packagerArgs.join("\n"));

  await execa(packagerBin, packagerArgs, {
    stdio: "inherit",
    cwd: outDir,
    detached: false,
  });

  const s3Dir = `package/${job.data.assetId}/${job.data.name}`;
  job.log(`Uploading to ${s3Dir}`);

  await uploadFolder(outDir, s3Dir, {
    del: true,
    commandInput: (input) => ({
      ContentType: lookup(input.Key) || "binary/octet-stream",
      ACL: "public-read",
    }),
  });

  job.updateProgress(100);

  return {
    assetId: job.data.assetId,
  };
};

function getGroupId(
  stream:
    | Extract<Stream, { type: "audio" }>
    | Extract<Stream, { type: "text" }>,
) {
  if (stream.type === "audio") {
    // When we package audio, we split codecs into a separate group.
    // The CODECS attribute would else include "ac-3,mp4a.40.2", which will
    // make HLS players fail as each CODECS attribute is needs to pass the
    // method |isTypeSupported| on MSE.
    return `audio_${stream.codec}`;
  }
  if (stream.type === "text") {
    return `text`;
  }
}

function getName(
  stream:
    | Extract<Stream, { type: "audio" }>
    | Extract<Stream, { type: "text" }>,
) {
  if (stream.type === "audio") {
    return `${stream.language}_${stream.codec}`;
  }
  if (stream.type === "text") {
    return `${stream.language}`;
  }
}
