const results = [];

// ---------- Helpers ----------Die Helpers bereiten rohe E-Mail-Daten so auf, dass der restliche Code zuverlässig Titel, Firma, Ort, Links und Remote-Infos erkennen kann.

function clean(value) {
  return String(value || "")
    .replace(/͏|‌/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function stripHeaderPrefix(value) {
  return clean(value)
    .replace(/^Subject:\s*/i, "")
    .replace(/^From:\s*/i, "");
}

function decodeQuotedPrintable(str) {
  return String(str || "")
    .replace(/_/g, " ")
    .replace(/=([A-Fa-f0-9]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function decodeMimeWords(value) {
  let text = stripHeaderPrefix(value);
  text = text.replace(/\r?\n\s+/g, " ");

  return text.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, charset, encoding, encodedText) => {
    try {
      if (encoding.toUpperCase() === "B") {
        return Buffer.from(encodedText, "base64").toString("utf8");
      }

      if (encoding.toUpperCase() === "Q") {
        return Buffer.from(decodeQuotedPrintable(encodedText), "binary").toString("utf8");
      }

      return encodedText;
    } catch (e) {
      return encodedText;
    }
  });
}

function htmlToText(html) {
  return clean(
    String(html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/td>/gi, " ")
      .replace(/<\/span>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function detectSource(from, subject, html, link) {
  const sourceText = `${from} ${subject} ${html} ${link}`.toLowerCase();

  if (sourceText.includes("stepstone") || sourceText.includes("jobagent.stepstone")) return "StepStone";
  if (sourceText.includes("indeed")) return "Indeed";
  if (sourceText.includes("linkedin")) return "LinkedIn";
  if (sourceText.includes("jobware")) return "Jobware";

  return "Unbekannt";
}

// ---------- Links ----------Dieser Bereich sucht Job-Links aus der Mail heraus.

function isBadLink(url) {
  const lower = String(url || "").toLowerCase();

  return (
    lower.includes("unsubscribe") ||
    lower.includes("privacy") ||
    lower.includes("preference") ||
    lower.includes("preferences") ||
    lower.includes("statics.indeed.com") ||
    lower.includes("fonts.") ||
    lower.includes("/assets/") ||
    lower.includes(".css") ||
    lower.includes(".png") ||
    lower.includes(".jpg") ||
    lower.includes(".jpeg") ||
    lower.includes(".gif") ||
    lower.includes(".webp") ||
    lower.includes(".svg") ||
    lower.includes("mailto:") ||
    lower.includes("logo") ||
    lower.includes("image") ||
    lower.includes("banner") ||
    lower.includes("pixel") ||
    lower.includes("spacer") ||
    lower.includes("facebook") ||
    lower.includes("instagram") ||
    lower.includes("twitter") ||
    lower.includes("youtube") ||
    lower.includes("linkedin.com/company")
  );
}

function isJobLink(url) {
  const lower = String(url || "").toLowerCase();

  if (isBadLink(lower)) return false;

  return (
    lower.includes("stepstone") ||
    lower.includes("indeed") ||
    lower.includes("linkedin") ||
    lower.includes("jobware")
  );
}

function scoreLink(url) {
  const lower = String(url || "").toLowerCase();
  let score = 0;

  if (lower.includes("click.stepstone")) score += 6;
  if (lower.includes("jobagent.stepstone")) score += 5;
  if (lower.includes("stepstone")) score += 4;

  if (lower.includes("jobs")) score += 3;
  if (lower.includes("stellenangebote")) score += 3;
  if (lower.includes("stellenanzeige")) score += 3;
  if (lower.includes("job")) score += 2;
  if (lower.includes("viewjob")) score += 4;

  if (lower.includes("search")) score -= 3;
  if (lower.includes("jobalert")) score -= 3;
  if (lower.includes("alert")) score -= 2;
  if (lower.includes("recommendation")) score -= 1;

  return score;
}

function extractLinks(html) {
  const source = String(html || "");

  const anchorMatches = [...source.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  const buttonLinks = anchorMatches
    .map(match => {
      const href = clean(match[1]);
      const anchorText = htmlToText(match[2]).toLowerCase();

      return { href, anchorText };
    })
    .filter(item =>
      item.href.startsWith("http") &&
      isJobLink(item.href) &&
      (
        item.anchorText.includes("ich bin interessiert") ||
        item.anchorText.includes("interessiert") ||
        item.anchorText.includes("jetzt bewerben") ||
        item.anchorText.includes("bewerben") ||
        item.anchorText.includes("ansehen") ||
        item.anchorText.includes("job ansehen") ||
        item.anchorText.includes("stelle ansehen") ||
        item.anchorText.includes("mehr erfahren")
      )
    )
    .map(item => item.href);

  const hrefLinks = anchorMatches.map(match => clean(match[1]));

  const rawLinks = [...source.matchAll(/https?:\/\/[^\s"'<>]+/g)]
    .map(match => clean(match[0]));

  const allLinks = [...new Set([...buttonLinks, ...hrefLinks, ...rawLinks])]
    .filter(link => link.startsWith("http"))
    .filter(isJobLink);

  return allLinks.sort((a, b) => {
    const aButton = buttonLinks.includes(a) ? 1 : 0;
    const bButton = buttonLinks.includes(b) ? 1 : 0;

    if (aButton !== bButton) {
      return bButton - aButton;
    }

    return scoreLink(b) - scoreLink(a);
  });
}

function makeHyperlink(link) {
  if (!link) return "";

  const safeLink = String(link).replace(/"/g, '""');

  // Deutsches Google Sheets: Semikolon
  return `=HYPERLINK("${safeLink}";"Öffnen")`;

  // Falls dein Sheet die Formel nicht erkennt, nutze stattdessen:
  // return `=HYPERLINK("${safeLink}","Öffnen")`;
}

// ---------- Generic Extraction ----------Dieser Bereich zieht allgemeine Jobdaten aus Betreff, Snippet und Text.

function guessTitle(subject, snippet) {
  let title = decodeMimeWords(subject);

  title = title
    .replace(/^Martin,\s*unsere Empfehlung:\s*/i, "")
    .replace(/^Deine Chancen stehen gut für diese Stelle$/i, "")
    .replace(/^Neue Job-Chance für dich$/i, "")
    .replace(/^Nur wenige Bewerber für diese Stelle - jetzt bewerben$/i, "")
    .replace(/^Du bist ein guter Match.*$/i, "")
    .replace(/^Dein nächster Job könnte näher sein.*$/i, "")
    .trim();

  if (!title || title.length < 6) {
    title = clean(snippet)
      .replace(/Vielleicht ist der richtige Job diesmal dabei!/i, "")
      .trim();
  }

  return title;
}

function looksLikeBadCompany(value) {
  return /diesem Job|Fähigkeiten|punkten|Standort|Ort|Homeoffice|Vollzeit|Teilzeit|Mitarbeiter|Jahr|Gehalt|Salary|Contract|Location|Arbeitsort|Einsatzort|Remote|Hybrid|Bewerbung|bewerben|Profil|Kenntnisse|Erfahrung|Job|Stelle/i.test(
    clean(value)
  );
}

function cleanCompany(value) {
  const company = clean(value);

  if (!company) return "";
  if (looksLikeBadCompany(company)) return "";

  const legalFormPattern = [
    "GmbH\\s*&\\s*Co\\.\\s*KG",
    "GmbH",
    "mbH",
    "AG",
    "SE",
    "UG",
    "KG",
    "OHG",
    "GbR",
    "e\\.V\\.",
    "eG",
    "Ltd\\.?",
    "Limited",
    "Inc\\.?",
    "Corp\\.?",
    "Corporation",
    "LLC"
  ].join("|");

  const companyMatch = company.match(
    new RegExp(
      `([A-ZÄÖÜ][A-ZÄÖÜa-zäöüß0-9 .,&+\\-()\\/]*?(?:${legalFormPattern}))`,
      "i"
    )
  );

  if (companyMatch && companyMatch[1]) {
    return clean(companyMatch[1]);
  }

  return "";
}

function extractCompany(title, text) {
  const combined = clean(`${title} ${text}`);

  const patterns = [
    /bei\s+([A-ZÄÖÜ][A-ZÄÖÜa-zäöüß0-9 .,&+\-()]{2,100})/i,
    /at\s+([A-Z][A-Za-z0-9 .,&+\-()]{2,100})/i,
    /Firma\s*[:\-]\s*([A-ZÄÖÜ][A-ZÄÖÜa-zäöüß0-9 .,&+\-()]{2,100})/i,
    /Unternehmen\s*[:\-]\s*([A-ZÄÖÜ][A-ZÄÖÜa-zäöüß0-9 .,&+\-()]{2,100})/i,
    /Company\s*[:\-]\s*([A-Z][A-Za-z0-9 .,&+\-()]{2,100})/i
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match && match[1]) {
      const candidate = clean(match[1])
        .replace(/(Ort|Standort|Arbeitsort|Remote|Hybrid|Vollzeit|Teilzeit).*$/i, "")
        .trim();

      const company = cleanCompany(candidate);

      if (company) return company;
    }
  }

  return "";
}

function extractRemoteHybrid(text) {
  const lower = clean(text).toLowerCase();

  if (
    lower.includes("remote") ||
    lower.includes("homeoffice") ||
    lower.includes("home office") ||
    lower.includes("deutschlandweit")
  ) {
    return "Remote";
  }

  if (lower.includes("hybrid")) {
    return "Hybrid";
  }

  if (
    lower.includes("vor ort") ||
    lower.includes("onsite") ||
    lower.includes("on-site")
  ) {
    return "Vor Ort";
  }

  return "";
}

function extractLocation(text) {
  const cleaned = clean(text);

  const labeledPatterns = [
    /(?:Standort|Ort|Arbeitsort|Einsatzort)\s*[:\-]\s*([A-ZÄÖÜ][A-ZÄÖÜa-zäöüß .,/()-]{1,80})/i,
    /(?:Location|Workplace)\s*[:\-]\s*([A-Z][A-Za-z .,/()-]{1,80})/i
  ];

  for (const pattern of labeledPatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      return clean(match[1])
        .replace(/(Vollzeit|Teilzeit|Festanstellung|Permanent|Full-time|Part-time|Hybrid|Remote|Homeoffice).*$/i, "")
        .trim();
    }
  }

  const knownCities = [
    "Berlin", "Hamburg", "München", "Munich", "Köln", "Cologne", "Düsseldorf",
    "Frankfurt", "Frankfurt am Main", "Stuttgart", "Leipzig", "Dresden",
    "Bremen", "Hannover", "Nürnberg", "Nuremberg", "Bonn", "Essen",
    "Dortmund", "Mannheim", "Karlsruhe", "Augsburg", "Wiesbaden", "Münster",
    "Mainz", "Ulm", "Freiburg", "Heidelberg", "Regensburg", "Potsdam",
    "Bochum", "Wuppertal", "Bielefeld", "Duisburg", "Kiel", "Lübeck",
    "Rostock", "Erfurt", "Jena", "Kassel", "Aachen", "Osnabrück",
    "Deutschland", "Germany"
  ];

  for (const city of knownCities) {
    const regex = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(cleaned)) return city;
  }

  const phrasePatterns = [
    /(?:^|\s)(?:in)\s+([A-ZÄÖÜ][A-ZÄÖÜa-zäöüß.-]+(?:\s+[A-ZÄÖÜ][A-ZÄÖÜa-zäöüß.-]+){0,3})(?:\s|,|\||-|–|\(|\))/i,
    /(?:based in|located in)\s+([A-Z][A-Za-z.-]+(?:\s+[A-Z][A-Za-z.-]+){0,3})(?:\s|,|\||-|–|\(|\))/i
  ];

  for (const pattern of phrasePatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const candidate = clean(match[1]);

      const blacklist = [
        "StepStone", "Indeed", "LinkedIn", "Jobware", "Designer",
        "Product Designer", "UX Designer", "UI Designer", "Grafik Designer",
        "Screen Designer", "Mediengestalter", "Schnellbewerbung"
      ];

      if (!blacklist.some(word => candidate.toLowerCase().includes(word.toLowerCase()))) {
        return candidate;
      }
    }
  }

  const remoteMatch = cleaned.match(/\b(Remote|Homeoffice|Home Office|Hybrid|Deutschlandweit|Germany-wide)\b/i);
  if (remoteMatch) return clean(remoteMatch[1]);

  return "";
}

// ---------- StepStone Specific Extraction ----------Dieser Bereich ist speziell für StepStone-Mails, weil deren HTML anders aufgebaut ist.
function extractCompanyCandidatesFromChunk(chunk) {
  const readable = String(chunk || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/span>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/td>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return readable
    .split(/\n/)
    .map(clean)
    .filter(Boolean)
    .filter(value => value.length >= 2 && value.length <= 140)
    .filter(value => !looksLikeBadCompany(value));
}

function extractStepStoneCompany(html) {
  const source = String(html || "");

  const markers = [
    /<img[^>]+alt=["']company["'][^>]*>/i,
    /<svg[^>]+data-genesis-element=["']BriefcaseIcon["'][\s\S]*?<\/svg>/i,
    /BriefcaseIcon/i,
    /briefcase-icon/i
  ];

  for (const marker of markers) {
    const match = source.match(marker);

    if (!match || match.index === undefined) continue;

    // Nur den Bereich direkt nach dem company/briefcase Icon ansehen
    const chunk = source.slice(match.index, match.index + 5000);
    const candidates = extractCompanyCandidatesFromChunk(chunk);

    for (const candidate of candidates) {
      const company = cleanCompany(candidate);

      if (company) return company;
    }
  }

  // Fallback: global im HTML/Text nach Firmen mit Rechtsform suchen
  const text = htmlToText(source);

  const globalCompanyMatch = text.match(
    /([A-ZÄÖÜ][A-ZÄÖÜa-zäöüß0-9 .,&+\-()\/]*?(?:GmbH\s*&\s*Co\.\s*KG|GmbH|mbH|AG|SE|UG|KG|OHG|GbR|e\.V\.|eG|Ltd\.?|Limited|Inc\.?|Corp\.?|Corporation|LLC))/i
  );

  if (globalCompanyMatch && globalCompanyMatch[1]) {
    return cleanCompany(globalCompanyMatch[1]);
  }

  return "";
}

function extractStepStoneIconValue(html, altName) {
  const source = String(html || "");
  const escapedAlt = altName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const imgRegex = new RegExp(`<img[^>]+alt=["']${escapedAlt}["'][^>]*>`, "i");
  const imgMatch = source.match(imgRegex);

  if (!imgMatch || imgMatch.index === undefined) return "";

  const chunk = source.slice(imgMatch.index, imgMatch.index + 3000);

  const spanValues = [...chunk.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)]
    .map(match => htmlToText(match[1]))
    .map(clean)
    .map(value => value.replace(/\u00A0/g, " ").trim())
    .filter(Boolean)
    .filter(value => value !== "&nbsp;")
    .filter(value => !/^(\s|&nbsp;)*$/.test(value))
    .filter(value => value !== " ");

  if (altName === "company") {
    return extractStepStoneCompany(html);
  }

  if (altName === "location") {
    return spanValues.find(value =>
      !/GmbH|mbH|AG|SE|KG|OHG|UG|Ltd|Inc|Corp|Mitarbeiter|Jahr|Vollzeit|Teilzeit|Homeoffice|Fähigkeiten|punkten/i.test(value)
    ) || "";
  }

  if (altName === "time") {
    return spanValues.find(value =>
      /Homeoffice|Remote|Hybrid|Vollzeit|Teilzeit/i.test(value)
    ) || "";
  }

  return spanValues[0] || "";
}

function extractStepStoneIconValues(html) {
  return {
    company: extractStepStoneCompany(html),
    location: extractStepStoneIconValue(html, "location"),
    time: extractStepStoneIconValue(html, "time"),
    contractType: extractStepStoneIconValue(html, "contract type"),
    salary: extractStepStoneIconValue(html, "salary"),
    employees: extractStepStoneIconValue(html, "number of employees")
  };
}

function extractStepStoneTitles(text) {
  const titleKeywords = [
    "UX",
    "UI",
    "Product Designer",
    "Designer",
    "Grafik",
    "Grafiker",
    "Mediengestalter",
    "Screen Designer",
    "Visual Designer",
    "Interaction Designer",
    "Web Designer"
  ];

  const rawLines = String(text || "")
    .split(/\n|(?<=\))\s+(?=[A-ZÄÖÜ])/)
    .map(clean)
    .filter(Boolean);

  const badFragments = [
    "Vielleicht ist der richtige Job diesmal dabei",
    "Bewirb dich jetzt",
    "Jetzt bewerben",
    "Datenschutz",
    "Impressum",
    "Abmelden",
    "unsubscribe",
    "StepStone",
    "Jobs des Tages",
    "Neue Job-Chance",
    "Alle Jobs ansehen",
    "Job Agent",
    "Stellenangebote",
    "Empfehlung"
  ];

  return [...new Set(
    rawLines.filter(line => {
      const hasKeyword = titleKeywords.some(keyword =>
        line.toLowerCase().includes(keyword.toLowerCase())
      );

      const isBad = badFragments.some(fragment =>
        line.toLowerCase().includes(fragment.toLowerCase())
      );

      return (
        hasKeyword &&
        !isBad &&
        line.length >= 8 &&
        line.length <= 140
      );
    })
  )];
}

function parseStepStoneMail({ date, subject, snippet, html, text, links }) {
  const titles = extractStepStoneTitles(text);
  const iconValues = extractStepStoneIconValues(html);

  // Absichtlich nicht aus jedem Link eine Zeile machen.
  // Sonst entstehen viele kaputte StepStone-Zeilen.
  const max = Math.max(titles.length, 1);
  const rows = [];

  for (let i = 0; i < max; i++) {
    const title = titles[i] || guessTitle(subject, snippet);
    const localText = `${title} ${subject} ${snippet} ${text}`;
    const rawLink = links[i] || links[0] || "";

    rows.push({
      json: {
        Datum: date,
        Quelle: "StepStone",
        Titel: title,
        Firma: iconValues.company || "",
        Ort: iconValues.location || extractLocation(localText),
        "Remote/Hybrid": iconValues.time || extractRemoteHybrid(localText),
        Link: makeHyperlink(rawLink),
        Kurzbeschreibung: snippet || title,
        Keywords: "",
        Status: rawLink ? "neu" : "prüfen",
        "Mail-Betreff": subject,
        "Raw Link": rawLink
      }
    });
  }

  return rows;
}

// ---------- Standard Parser ----------Der Standard Parser ist für alle Jobmails gedacht, die nicht von StepStone kommen. Die Funktion parseStandardMail() erstellt dabei genau eine Tabellenzeile pro Mail. Dafür nutzt sie die allgemeinen Extraktionsfunktionen, um Informationen wie Jobtitel, Firmenname, Standort, Remote-/Hybridstatus und den passenden Bewerbungslink aus der Mail herauszufiltern. Wenn ein gültiger Joblink gefunden wird, bekommt der Datensatz den Status neu. Falls kein brauchbarer Link erkannt wird, wird der Status auf prüfen gesetzt.
//Im Main-Bereich läuft anschließend die eigentliche Verarbeitung aller eingehenden Mails ab. Für jede Mail werden zuerst Betreff, Absender, Snippet und HTML-Inhalt ausgelesen. Danach werden die Daten bereinigt und eventuell kodierte Zeichen oder MIME-Header decodiert. Der HTML-Inhalt wird anschließend in normalen Text umgewandelt, damit der Code einfacher Informationen daraus lesen kann. Danach werden alle relevanten Links extrahiert und das Datum der Mail gesetzt. Anschließend versucht der Code zu erkennen, von welcher Plattform die Mail stammt, zum Beispiel StepStone, Indeed oder LinkedIn. Wenn die Quelle StepStone ist, wird der spezielle StepStone-Parser verwendet, da diese Mails anders aufgebaut sind. Für alle anderen Quellen nutzt der Code den Standard-Parser. Alle erzeugten Datensätze werden am Ende im Array results gesammelt und mit return results; zurückgegeben.

function parseStandardMail({ date, quelle, subject, snippet, html, text, links }) {
  const title = guessTitle(subject, snippet);
  const combinedText = `${title} ${subject} ${snippet} ${text}`;
  const rawLink = links[0] || "";

  return [
    {
      json: {
        Datum: date,
        Quelle: quelle,
        Titel: title,
        Firma: cleanCompany(extractCompany(title, combinedText)),
        Ort: extractLocation(combinedText),
        "Remote/Hybrid": extractRemoteHybrid(combinedText),
        Link: makeHyperlink(rawLink),
        Kurzbeschreibung: snippet || text.substring(0, 180),
        Keywords: "",
        Status: rawLink ? "neu" : "prüfen",
        "Mail-Betreff": subject,
        "Raw Link": rawLink
      }
    }
  ];
}

// ---------- Main ----------

for (const item of $input.all()) {
  const json = item.json;

  const rawSubject = json.Subject || json.subject || json.headers?.subject || "";
  const rawFrom = json.From || json.from || json.headers?.from || "";
  const snippet = clean(json.snippet || "");

  const subject = decodeMimeWords(rawSubject);
  const from = stripHeaderPrefix(rawFrom);

  const html = json.html || json.textHtml || "";
  const text = htmlToText(html);
  const links = extractLinks(html);

  const date = json.internalDate
    ? new Date(Number(json.internalDate)).toISOString()
    : new Date().toISOString();

  const quelle = detectSource(from, subject, html, links[0] || "");

  if (quelle === "StepStone") {
    results.push(
      ...parseStepStoneMail({
        date,
        subject,
        snippet,
        html,
        text,
        links
      })
    );
  } else {
    results.push(
      ...parseStandardMail({
        date,
        quelle,
        subject,
        snippet,
        html,
        text,
        links
      })
    );
  }
}

return results;