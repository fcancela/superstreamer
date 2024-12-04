import { assert } from "shared/assert";
import { filterMasterPlaylist, formatFilterToQueryParam } from "./filters";
import { getAssets, getStaticDateRanges } from "./interstitials";
import { encrypt } from "./lib/crypto";
import { joinUrl, makeUrl, resolveUri } from "./lib/url";
import {
  parseMasterPlaylist,
  parseMediaPlaylist,
  stringifyMasterPlaylist,
  stringifyMediaPlaylist,
} from "./parser";
import { getRenditions } from "./parser/helpers";
import { updateSession } from "./session";
import { fetchVmap, toAdBreakTimeOffset } from "./vmap";
import type { Filter } from "./filters";
import type { Session } from "./session";
import type { DateTime } from "luxon";

export async function formatMasterPlaylist(params: {
  origUrl: string;
  session?: Session;
  filter?: Filter;
}) {
  if (params.session) {
    await updateSessionOnMaster(params.session);
  }

  const master = await fetchMasterPlaylist(params.origUrl);

  if (params.filter) {
    filterMasterPlaylist(master, params.filter);
  }

  for (const variant of master.variants) {
    const url = joinUrl(params.origUrl, variant.uri);
    variant.uri = makeMediaUrl({
      url,
      sessionId: params.session?.id,
    });
  }

  const renditions = getRenditions(master.variants);

  renditions.forEach((rendition) => {
    const url = joinUrl(params.origUrl, rendition.uri);
    rendition.uri = makeMediaUrl({
      url,
      sessionId: params.session?.id,
      type: rendition.type,
    });
  });

  return stringifyMasterPlaylist(master);
}

export async function formatMediaPlaylist(
  mediaUrl: string,
  session?: Session,
  renditionType?: string,
) {
  const media = await fetchMediaPlaylist(mediaUrl);

  // We're in a video playlist when we have no renditionType passed along,
  // this means it does not belong to EXT-X-MEDIA, or when we explicitly VIDEO.
  const videoPlaylist = !renditionType || renditionType === "VIDEO";
  const firstSegment = media.segments[0];

  if (session) {
    assert(firstSegment);

    if (media.endlist) {
      firstSegment.programDateTime = session.startTime;
    }

    if (videoPlaylist) {
      // If we have an endlist and a PDT, we can add static date ranges based on this.
      media.dateRanges = getStaticDateRanges(session);
    }
  }

  media.segments.forEach((segment) => {
    if (segment.map?.uri === "init.mp4") {
      segment.map.uri = joinUrl(mediaUrl, segment.map.uri);
    }
    segment.uri = joinUrl(mediaUrl, segment.uri);
  });

  return stringifyMediaPlaylist(media);
}

export async function formatAssetList(session: Session, dateTime: DateTime) {
  const assets = await getAssets(session, dateTime);
  return {
    ASSETS: assets,
  };
}

async function fetchMasterPlaylist(url: string) {
  const response = await fetch(url);
  const result = await response.text();
  return parseMasterPlaylist(result);
}

async function fetchMediaPlaylist(url: string) {
  const response = await fetch(url);
  const result = await response.text();
  return parseMediaPlaylist(result);
}

export async function fetchDuration(uri: string) {
  const url = resolveUri(uri);
  const variant = (await fetchMasterPlaylist(url))?.variants[0];

  if (!variant) {
    throw new Error(`Missing variant for "${url}"`);
  }

  const media = await fetchMediaPlaylist(joinUrl(url, variant.uri));
  return media.segments.reduce((acc, segment) => {
    acc += segment.duration;
    return acc;
  }, 0);
}

export function makeMasterUrl(params: {
  url: string;
  filter?: Filter;
  session?: Session;
}) {
  const fil = formatFilterToQueryParam(params.filter);

  const outUrl = makeUrl("out/master.m3u8", {
    eurl: encrypt(params.url),
    sid: params.session?.id,
    fil,
  });

  const url = params.session
    ? makeUrl(`session/${params.session.id}/master.m3u8`, {
        fil,
      })
    : undefined;

  return { url, outUrl };
}

function makeMediaUrl(params: {
  url: string;
  sessionId?: string;
  type?: string;
}) {
  return makeUrl("out/playlist.m3u8", {
    eurl: encrypt(params.url),
    sid: params.sessionId,
    type: params.type,
  });
}

async function updateSessionOnMaster(session: Session) {
  let storeSession = false;

  if (session.vmap) {
    const vmap = await fetchVmap(session.vmap);
    delete session.vmap;

    if (!session.interstitials) {
      session.interstitials = [];
    }

    for (const adBreak of vmap.adBreaks) {
      const timeOffset = toAdBreakTimeOffset(adBreak);

      if (timeOffset === null) {
        continue;
      }

      const dateTime = session.startTime.plus({ seconds: timeOffset });

      let interstitial = session.interstitials.find((interstitial) => {
        return interstitial.dateTime.equals(dateTime);
      });

      if (!interstitial) {
        interstitial = {
          dateTime,
          vastData: [],
          assets: [],
        };
        session.interstitials.push(interstitial);
      }

      if (adBreak.vastUrl) {
        interstitial.vastData.push({ type: "url", url: adBreak.vastUrl });
      }
      if (adBreak.vastData) {
        interstitial.vastData.push({ type: "data", data: adBreak.vastData });
      }
    }

    storeSession = true;
  }

  if (storeSession) {
    await updateSession(session);
  }
}
