const { parseCSVText, csvToTransactions, BROKER_PROFILES } = require("./lib/csv-parser");
const { buildTradesFromTransactions } = require("./lib/trade-matcher");

const data = `Date	Time	Name	Buy/Sell	Order	Exchange	Segment	Quantity/Lot	Trade Price	Trade Value	Status
30/06/2025	9:40:08	HPL Electric & Power	BUY	DELIVERY	NSE	Equity	150	556	83400	Traded
25/06/2025	13:25:26	Bharat Dynamics	SELL	DELIVERY	NSE	Equity	78	1812	141336	Traded
16/06/2025	9:31:54	Ircon International	SELL	DELIVERY	NSE	Equity	320	197.09	63068.93	Traded
06/05/2025	9:21:36	BSE	SELL	DELIVERY	NSE	Equity	10	6435	64350	Traded
`;

const rows = parseCSVText(data);
const res = csvToTransactions(rows, BROKER_PROFILES.dhan);
console.log("Parsed transactions:", res.transactions.length);
console.log("Errors:", res.errors);
