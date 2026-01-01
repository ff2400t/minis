/**
 * @typedef {Object} Parser
 * @property {string} name
 * @property {string[]} matches - Array of keywords to match
 * @property {RegExp} metadata - The regular expression used to extract metadata from the text.
 * @property {RegExp} [table] - The regular expression used to match table data from the text.
 * @property {ParseFunc} [func] - A function that processes the text and applies regex patterns to extract metadata and table data.
 */

/**
 * @typedef {Object.<string, string>} StringMap
 * @typedef {{ allRows: string[][], metadataFields: StringMap}} ParserResult
 */

/**
 * @callback ParseFunc
 * @param {string} text
 * @param {RegExp | undefined} metadata
 * @param {RegExp | undefined} table
 * @returns {ParserResult}
 */

/*
 * @type {Parser[]}
 */
export const BUILT_IN_PARSERS = [
  {
    name: "GST Challan",
    matches: ["GOODS AND SERVICES TAX", "PAYMENT RECEIPT"],
    metadata:
      // /Name:\s+(?<Name>.*?)\s+Address.*?GSTIN:\s+(?<GSTIN>\w+).*?Date :\s+(?<Date>\d\d\/\d\d\/\d{4}).*?(?<StateCode>\d+)\s+(?<StateName>[^\d]+?)\s+SGST/s,
      /Date : (?<DepositDate>\d\d[\/-]\d\d[\/-]\d{4}) .* GSTIN: (?<GSTIN>.*?) .* Name:\s+(?<Name>.*?) Address.* \s+(?<StateName>[^\d]+?)\s+SGST/s,
    table:
      /(?<name>\w+)\(.*?\)\s+(?<tax>-|\d+)\s+(?<interest>-|\d+)\s+(?<penalty>-|\d+)\s+(?<fees>-|\d+)\s+(?<others>-|\d+)\s+(?<total>-|\d+)\s+/g,
    /** @type ParseFunc **/
    func: (text, metaRx, tableRx) => {
      /** @type {StringMap} */
      const metadataFields = {};
      // @ts-ignore: we know this will have a metadata regex
      const metaMatch = text.match(metaRx);
      if (metaMatch && metaMatch.groups) {
        Object.assign(metadataFields, metaMatch.groups);
      }

      const metadataRows = Object.entries(metadataFields).map((
        [k, v],
      ) => [k, v, "", "", "", "", ""]);
      // @ts-ignore
      const matches = [...text.matchAll(tableRx)];
      const headers = [
        "Head",
        "Tax",
        "Interest",
        "Penalty",
        "Fees",
        "Others",
        "Total",
      ];
      const dataRows = matches.map(
        (m) =>
          m.groups
            ? [
              m.groups.name,
              m.groups.tax,
              m.groups.interest,
              m.groups.penalty,
              m.groups.fees,
              m.groups.others,
              m.groups.total,
            ]
            : [],
      );

      const totalMatch = text.match(/Total Amount\s+([\d,]+)/);
      // @ts-ignore it's fine
      if (totalMatch && !matches.find((m) => m.groups.name === "Total")) {
        dataRows.push([
          "Grand Total",
          "-",
          "-",
          "-",
          "-",
          "-",
          totalMatch[1].replace(/,/g, ""),
        ]);
      }
      return {
        allRows: [...metadataRows, headers, ...dataRows],
        metadataFields,
      };
    },
  },
  {
    name: "GSTR-3B",
    matches: ["Form GSTR-3B", "See rule 61(5)"],
    metadata:
      /Year (?<Year>[\d-]+)\s+Period\s+(?<Period>.*)\s+GSTIN\s+of\s+the\s+supplier\s+(?<GSTIN>\w+)\s+2\(a\)\.\s+Legal\s+name\s+of\s+the\s+registered\s+person\s+(?<Name>.*)\s+2\(b\).*Date of ARN (?<ARN_Date>[\d\/]+)/,
    // another attempt to fix the above
    table:
      /\([a-e]\s?\) (?<Particular>[A-Z].*?) (?<TaxableValue>\d+\.\d\d|-)\s+(?<IGST>\d+\.\d\d|-)\s+(?<CGST>\d+\.\d\d|-)\s+(?<SGST>\d+\.\d\d|-)\s+(?<Cess>\d+\.\d\d|-)\s+/g,
  },
  {
    name: "TDS",
    matches: ["INCOME TAX DEPARTMENT", "Challan Receipt"],
    metadata:
      /Name : (?<Name>.*?)\s+Ass.* Nature of Payment : (?<SectionNo>\w+)\s+Amount \(in\s+Rs\.\) : ₹ (?<Amount>\d[\d,.]*).*(?<DepositDate>\d\d\-\s?\w{3}-\d{4})/,
  },
  {
    name: "Union Bank Statement",
    matches: ["Union Bank of India", "Statement of Account"],
    metadata:
      /Statement of Account\s+(?<Account_Holder_Name>.*?)\s+.* Account No\s+(?<Account_Number>\d+)/is,
    table:
      /(?<date>\d\d-\d\d-\d{4})\s+\d\d:\d\d:\d\d\s+(?<particulars>.*?)\s+(?<amt>[\d,]+\.\d\s?\d)\s+(?<bal>-?\s?[\d,]+\.\d\s?\d)/g,
  },
  {
    name: "Canara Bank Statement",
    matches: ["Canara Bank does not"],
    metadata:
      /Account Number (?<Account_Number>\d+).* Opening Balance Rs\. (?<Opening_Balance>-?[\d,]+\.\d\d)\s+Closing Balance Rs\. (?<Closing_Balance>-?[\d,]+\.\d\d)/s,
    table:
      /\s\s(?<date>\d\d-\d\d-\d{4})\s+\d\d:\d\d:\d\d\s+(?<particulars>.*?)\s+(?<amt>[\d+,]+\.\d\d)\s+(?<bal>-?[\d+,]+\.\d\d)/g,
  },
  {
    name: "RBL Bank Statement",
    matches: ["RBL BANK LTD"],
    metadata:
      /Account Name: (?<Account_Name>.*?) Home Branch: .* in Account Number:\s+(?<Account_Number>\d+)\s+.* Opening Balance: ₹ (?<Opening_Balance>[\d,]+\.\d{2})\s+Count Of Debit: \d+\s+Closing Balance: ₹ (?<Closing_Balance>[\d,]+\.\d{2})/s,
    table:
      /(?<date>\d\d\/\d\d\/\d{4})\s+\d\d\/\d\d\/\d{4}\s+(?<particular>.*?)\s+(?<amt>[\d,]+\.\s?\d\s?\d)\s+(?<bal>[\d,]+\s?\.\s?\d\s?\d)/g,
    func: generalDocumentParser,
  },
  {
    name: "IDBI Bank Statement",
    matches: ["IDBI Bank or other authorities"],
    metadata: /^(?<Name>.*?) Address .* A\/C NO: (?<AccNo>\d+)/s,
    table:
      /(?<date>\d\d\/\d\d\/\d{4})\s+(?<particular>.*?)\s+(?<type>Dr\.|Cr\.)\s+\w{3}\s+(?<Amt>[\d,]+\.\d{2})\s+\d\d\/\d\d\/\d{4}\s+\d\d:\d\d:\d\d\s+(?<serialNo>\d+)\s+(?<Bal>-?[\d,]+\.\d{2})/g,
    /** @type ParseFunc **/
    func: (text, metaRx, tableRx) => {
      // @ts-ignore: we know this will have a metadata regex
      const metadataMatch = text.match(metaRx);
      const metadataFields = {
        "Account Name": metadataMatch?.groups?.Name?.trim() || "N/A",
        "Account Number": metadataMatch?.groups?.AccNo || "N/A",
      };
      const metadataRows = Object.entries(metadataFields).map((
        [k, v],
      ) => [k, v, "", "", "", "", ""]);

      // @ts-ignore
      const matches = [...text.matchAll(tableRx)];
      const headers = [
        "Date",
        "Particulars/Description",
        "Type",
        "Amount",
        "Serial No",
        "Balance",
        "",
      ];
      const dataRows = matches.map((m) => {
        /** @type {any} */
        const g = m.groups;
        const amount = g.type === "Dr." ? `-${g.Amt}` : g.Amt;
        return [
          g.date,
          g.particular.trim(),
          g.type,
          amount.replace(/,/g, ""),
          g.serialNo,
          g.Bal.replace(/,/g, ""),
          "",
        ];
      });
      return {
        allRows: [...metadataRows, headers, ...dataRows],
        metadataFields,
      };
    },
  },
  {
    name: "PNB",
    matches: [`Stk Stmt: Stock Statement`, `Trf: Transfer`],
    metadata:
      /Account Number (?<AccountNumber>\d+).*?Account Name: (?<Name>.*?) Customer Address/,
    table:
      /(?<TxnNo>[A-Z]{1}\d+) (?<date>\d\d\/\d\d\/\d{4}) (?<description>.*?) (?<Amt>-?\s?\d[\d,.\s]+\d) (?<bal>\d[\d,.\s]+\d) (?<Effect>Cr|Dr)/g,
  },
  {
    name: "ICICI",
    matches: [
      "PAN can be updated online or at the nearest ICICI Bank Branch .",
    ],
    metadata:
      /^.*?  (?<Name>.*?)  .* (?<OpeningDate>\d\d-\d\d-\d{4}) B\/F (?<OpeningBalance>[\d,.]+)/s,
    table:
      /(?<Date>\d\d-\d\d-\d{4}) (?<Particular>.*?) (?<Amount>[\d,]+\.\d\d) (?<Balance>[\d,.]+) /g,
  },
  {
    name: "Professional Tax Challan",
    matches: ["CHALLAN MTR Form Number-6"],
    metadata:
      /Full Name (?<name>.*) Location.*From (?<period>.*) Flat.*TAX (?<amt>\d+\.\d{2}).*RBI Date (?<paymentDate>\d\d\/\d\d\/\d{4})/s,
  },
  {
    name: "Provident Fund Challan Receipts",
    matches: ["Payment Confirmation Receipt", "TRRN No"],
    metadata:
      /ID : (?<Name>.*?) Establishment Name .*? (?<WageMonth>\w+-\d{2,4}) Wage Month : (?<Amt>\d[\d,.]*).*? (Payment|Realization|Payment Confirmation) Date : (?<PaymentDate>\d{2}-\w+-\d{4})/s,
  },
  {
    name: "Provident Fund Challan",
    matches: [
      "COMBINED CHALLAN OF A/C NO. 01, 02, 10, 21 & 22 (With EMPLOYEES' PROVIDENT FUND ORGANISATION",
    ],
    metadata:
      /(?<Month>\w+) (?<Year>\d{4}) (?<TRRN>\d{13}) (?<Name>.*) Total Subscribers .* (?<Amt>[\d,]+) Grand Total :/s,
  },
];

// --- Core Parser Function ---
/**
 * @type {ParseFunc} text
 */
export function generalDocumentParser(
  text,
  metadataRegex,
  tableRegex,
) {
  let metadataRows = [];
  /** @type {{[key: string]: string}} */
  let metadataFields = {};

  // 1. Metadata Extraction
  if (metadataRegex) {
    try {
      const metaMatch = text.match(metadataRegex);
      if (metaMatch && metaMatch.groups) {
        for (const [key, value] of Object.entries(metaMatch.groups)) {
          const val = value ? value.trim() : "";
          metadataFields[key] = val;
          metadataRows.push([key, val, "", "", "", "", ""]);
        }
      }
    } catch (e) {
      console.error("Metadata Regex Error", e);
    }
  }

  // 2. Table Extraction
  /** @type {string[]} */
  let headers = [];
  /** @type {string[][]} */
  let dataRows = [];

  if (tableRegex) {
    try {
      const effectiveTableRegex = typeof tableRegex === "string"
        ? new RegExp(tableRegex, "g")
        : tableRegex;

      const matches = [...text.matchAll(effectiveTableRegex)];
      if (matches.length > 0) {
        const firstMatch = matches[0];
        if (firstMatch.groups) {
          headers = Object.keys(firstMatch.groups).map((k) =>
            k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ")
          );
        } else {
          headers = Array.from(
            { length: firstMatch.length - 1 },
            (_, i) => `Col ${i + 1}`,
          );
        }

        while (headers.length < 7) headers.push("");
        if (headers.length > 7) headers = headers.slice(0, 7);

        dataRows = matches.map((m) => {
          let row = [];
          if (m.groups) {
            row = Object.values(m.groups).map((val) =>
              val ? val.trim().replace(/,/g, "") : ""
            );
          } else {row = m.slice(1).map((val) =>
              val ? val.trim().replace(/,/g, "") : ""
            );}

          while (row.length < 7) row.push("");
          return row.slice(0, 7);
        });
      }
    } catch (e) {
      console.error("Table Regex Error", e);
    }
  }

  return { allRows: [...metadataRows, headers, ...dataRows], metadataFields };
}
