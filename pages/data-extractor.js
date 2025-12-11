/**
 * @typedef {Object} Parser
 * @property {string} name 
 * @property {string[]} match - Array of keywords to match
 * @property {RegExp} metaRegex - The regular expression used to extract metadata from the text.
 * @property {RegExp} tableRegex - The regular expression used to match table data from the text.
 * @property {function(string, RegExp, RegExp): { allRows: (string[]|Object[]), metadataFields: Object }} func - A function that processes the text and applies regex patterns to extract metadata and table data.
 */

/*
 * @type {Parser[]}
 */
export const BUILT_IN_PARSERS = [
  {
    name: "GST Challan",
    match: ["GOODS AND SERVICES TAX", "PAYMENT RECEIPT"],
    metaRegex:
      // /Name:\s+(?<Name>.*?)\s+Address.*?GSTIN:\s+(?<GSTIN>\w+).*?Date :\s+(?<Date>\d\d\/\d\d\/\d{4}).*?(?<StateCode>\d+)\s+(?<StateName>[^\d]+?)\s+SGST/s,
      /Date : (?<DepositDate>\d\d[\/-]\d\d[\/-]\d{4}) .* GSTIN: (?<GSTIN>.*?) .* Name:\s+(?<Name>.*?) Address.* \s+(?<StateName>[^\d]+?)\s+SGST/s,
    tableRegex:
      /(?<name>\w+)\(.*?\)\s+(?<tax>-|\d+)\s+(?<interest>-|\d+)\s+(?<penalty>-|\d+)\s+(?<fees>-|\d+)\s+(?<others>-|\d+)\s+(?<total>-|\d+)\s+/g,
    func: (text, metaRx, tableRx) => {
      const metadataFields = {};
      const metaMatch = text.match(metaRx);
      if (metaMatch && metaMatch.groups) {
        Object.assign(metadataFields, metaMatch.groups);
        if (metaMatch.groups.StateCode && metaMatch.groups.StateName) {
          metadataFields.State =
            `${metaMatch.groups.StateCode} ${metaMatch.groups.StateName}`;
          delete metadataFields.StateCode;
          delete metadataFields.StateName;
        }
      }

      const metadataRows = Object.entries(metadataFields).map((
        [k, v],
      ) => [k, v, "", "", "", "", ""]);
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
        (m) => [
          m.groups.name,
          m.groups.tax,
          m.groups.interest,
          m.groups.penalty,
          m.groups.fees,
          m.groups.others,
          m.groups.total,
        ],
      );

      const totalMatch = text.match(/Total Amount\s+([\d,]+)/);
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
    match: ["Form GSTR-3B", "See rule 61(5)"],
    metaRegex:
      /Year (?<Year>[\d-]+)\s+Period\s+(.*)\s+GSTIN\s+of\s+the\s+supplier\s+(?<GSTIN>\w+)\s+2\(a\)\.\s+Legal\s+name\s+of\s+the\s+registered\s+person\s+(?<Name>.*)\s+2\(b\)/,
      // the {5,50} is just a hack to so that .* doesn't go haywire and select more than is required.
    tableRegex:
      /\([a-e]\s?\) (.{5,50}) (\d+\.\d\d|-)\s+(\d+\.\d\d|-)\s+(\d+\.\d\d|-)\s+(\d+\.\d\d|-)\s+(\d+\.\d\d|-)\s+/g,
    func: generalDocumentParser,
  },
  {
    name: "TDS",
    match: ["INCOME TAX DEPARTMENT", "Challan Receipt"],
    metaRegex:
      /Nature of Payment : (?<Section_No>\w+)\s+Amount \(in\s+Rs\.\) : ₹ (?<Amount>\d[\d,.]*).*(?<Deposit_Date>\d\d\-\s?\w{3}-\d{4})/,
    func: generalDocumentParser,
  },
  {
    name: "Union Bank Statement",
    match: ["Union Bank of India", "Statement of Account"],
    metaRegex:
      /Statement of Account\s+(?<Account_Holder_Name>.*?)\s+.* Account No\s+(?<Account_Number>\d+)/is,
    tableReegx:
      /(?<date>\d\d-\d\d-\d{4})\s+\d\d:\d\d:\d\d\s+(?<particulars>.*?)\s+(?<amt>[\d,]+\.\d\s?\d)\s+(?<bal>-?\s?[\d,]+\.\d\s?\d)/g,
    func: generalDocumentParser,
  },
  {
    name: "Canara Bank Statement",
    match: ["Canara Bank does not"],
    metaRegex:
      /Account Number (?<Account_Number>\d+).* Opening Balance Rs\. (?<Opening_Balance>-?[\d,]+\.\d\d)\s+Closing Balance Rs\. (?<Closing_Balance>-?[\d,]+\.\d\d)/s,
    tableReegx:
      /\s\s(?<date>\d\d-\d\d-\d{4})\s+\d\d:\d\d:\d\d\s+(?<particulars>.*?)\s+(?<amt>[\d+,]+\.\d\d)\s+(?<bal>-?[\d+,]+\.\d\d)/g,
    func: generalDocumentParser,
  },
  {
    name: "RBL Bank Statement",
    match: ["RBL BANK LTD"],
    metaRegex:
      /Account Name: (?<Account_Name>.*?) Home Branch: .* in Account Number:\s+(?<Account_Number>\d+)\s+.* Opening Balance: ₹ (?<Opening_Balance>[\d,]+\.\d{2})\s+Count Of Debit: \d+\s+Closing Balance: ₹ (?<Closing_Balance>[\d,]+\.\d{2})/s,
    tableReegx:
      /(?<date>\d\d\/\d\d\/\d{4})\s+\d\d\/\d\d\/\d{4}\s+(?<particular>.*?)\s+(?<amt>[\d,]+\.\s?\d\s?\d)\s+(?<bal>[\d,]+\s?\.\s?\d\s?\d)/g,
    func: generalDocumentParser,
  },
  {
    name: "IDBI Bank Statement",
    match: ["IDBI Bank or other authorities"],
    metaRegex: /^(?<Name>.*?) Address .* A\/C NO: (?<AccNo>\d+)/s,
    tableRegex:
      /(?<date>\d\d\/\d\d\/\d{4})\s+(?<particular>.*?)\s+(?<type>Dr\.|Cr\.)\s+\w{3}\s+(?<Amt>[\d,]+\.\d{2})\s+\d\d\/\d\d\/\d{4}\s+\d\d:\d\d:\d\d\s+(?<serialNo>\d+)\s+(?<Bal>-?[\d,]+\.\d{2})/g,
    func: (text, metaRx, tableRx) => {
      const metadataMatch = text.match(metaRx);
      const metadataFields = {
        "Account Name": metadataMatch?.groups?.Name?.trim() || "N/A",
        "Account Number": metadataMatch?.groups?.AccNo || "N/A",
      };
      const metadataRows = Object.entries(metadataFields).map((
        [k, v],
      ) => [k, v, "", "", "", "", ""]);

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
    match: [`Stk Stmt: Stock Statement`, `Trf: Transfer`],
    metaRegex:
      /Account Number (?<AccountNumber>\d+).*?Account Name: (?<Name>.*?) Customer Address/,
    tableRegex:
      /(?<TxnNo>[A-Z]{1}\d+) (?<date>\d\d\/\d\d\/\d{4}) (?<description>.*?) (?<Amt>-?\s?\d[\d,.\s]+\d) (?<bal>\d[\d,.\s]+\d) (?<Effect>Cr|Dr)/,
    func: generalDocumentParser,
  },
  {
    name: "ICICI",
    match: ["PAN can be updated online or at the nearest ICICI Bank Branch ."],
    metaRegex:
      /^.*?  (?<Name>.*?)  .* (?<OpeningDate>\d\d-\d\d-\d{4}) B\/F (?<OpeningBalance>[\d,.]+)/,
    tableRegex:
      /(?<Date>\d\d-\d\d-\d{4}) (?<Particular>.*?) (?<Amount>[\d,]+\.\d\d) (?<Balance>[\d,.]+) /,
    func: generalDocumentParser,
  },
  {
    name: "Professional Tax Challan",
    match: ["CHALLAN MTR Form Number-6"],
    metaRegex:
      /Full Name (?<name>.*) Location.*From (?<period>.*) Flat.*TAX (?<amt>\d+\.\d{2}).*RBI Date (?<paymentDate>\d\d\/\d\d\/\d{4})/s,
    func: generalDocumentParser,
  },
  {
    name: "Provident Fund Challan Receipts",
    match: ["Payment Confirmation Receipt","TRRN No"],
    metaRegex:
      /ID : (?<Name>.*) Establishment Name.*\s(?<WageMonth>\w+-\d{4}) Wage Month : (?<Amt>\d[\d,.]*).*Payment Date : (?<PaymentDate>\d{2}-\w+-\d{4})/,
    func: generalDocumentParser,
  },
  {
    name: "Provident Fund Challan",
    match: [
      "COMBINED CHALLAN OF A/C NO. 01, 02, 10, 21 & 22 (With EMPLOYEES' PROVIDENT FUND ORGANISATION",
    ],
    metaRegex:
      /(?<Month>\w+) (?<Year>\d{4}) (?<TRRN>\d{13}) (?<Name>.*) Total Subscribers .* (?<Amt>[\d,]+) Grand Total :/s,
    func: generalDocumentParser,
  },
];

// --- Core Parser Function ---
export function generalDocumentParser(
  text,
  metadataRegex,
  tableRegex,
) {
  let metadataRows = [];
  let metadataFields = {};

  // 1. Metadata Extraction
  if (metadataRegex) {
    try {
      const metaMatch = text.match(metadataRegex);
      if (metaMatch) {
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
  let headers = [];
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
