import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import * as timeFormat from "hh-mm-ss";

export interface VmapSlot {
  vastUrl?: string;
  vastData?: string;
}

export interface VmapAdBreak {
  timeOffset: number;
  slots: VmapSlot[];
}

export interface VmapResponse {
  adBreaks: VmapAdBreak[];
}

export function parseVmap(text: string): VmapResponse {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/xml");
  const rootElement = doc.documentElement;

  if (rootElement.localName !== "VMAP") {
    throw new Error("Url did not resolve in a vmap");
  }

  const adBreaks: VmapAdBreak[] = [];

  childList(rootElement).forEach((element) => {
    if (element.localName === "AdBreak") {
      const timeOffset = toTimeOffset(element.getAttribute("timeOffset"));
      if (timeOffset === null) {
        return;
      }

      const slot = getSlot(element);
      if (!slot) {
        return;
      }

      let adBreak = adBreaks.find(
        (adBreak) => adBreak.timeOffset === timeOffset,
      );
      if (!adBreak) {
        adBreak = {
          timeOffset,
          slots: [],
        };
        adBreaks.push(adBreak);
      }

      adBreak.slots.push(slot);
    }
  });

  return { adBreaks };
}

function getAdSource(element: Element) {
  return childList(element).find((child) => child.localName === "AdSource");
}

function getSlot(element: Element): VmapSlot {
  const vastUrl = getVastUrl(element);
  const vastData = getVastData(element);
  return {
    vastUrl,
    vastData,
  };
}

function getVastUrl(element: Element) {
  const adSource = getAdSource(element);
  if (!adSource) {
    return;
  }

  const adTagUri = childList(adSource).find(
    (child) => child.localName === "AdTagURI",
  );

  return adTagUri?.textContent?.trim();
}

function getVastData(element: Element) {
  const adSource = getAdSource(element);
  if (!adSource) {
    return;
  }

  const vastAdData = childList(adSource).find(
    (child) => child.localName === "VASTAdData",
  );

  if (!vastAdData?.firstChild) {
    return;
  }

  const xmlSerializer = new XMLSerializer();

  return xmlSerializer.serializeToString(vastAdData.firstChild);
}

function childList(node: Element) {
  return Array.from(node.childNodes) as Element[];
}

function toTimeOffset(value: string | null) {
  if (value === null) {
    return null;
  }
  if (value === "start") {
    return 0;
  }
  if (value === "end") {
    return null;
  }
  return timeFormat.toS(value);
}
