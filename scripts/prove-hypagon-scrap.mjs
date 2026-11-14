import { Page } from "hypagon-scrap";

const html = `<html><body><div class="products">
  <article class="product" id="p1"><h3>Widget</h3><span class="price">19.99</span></article>
  <article class="product" id="p2"><h3>Gadget</h3><span class="price">29.99</span></article>
</div></body></html>`;

const page = await Page.load(html);
const [article] = page.css("article.product");
console.log("css:", article.attrs.id, "| price:", article.css("span.price")[0].text);
console.log("allText:", page.root.getAllText({ separator: " | " }));

const fp = article.fingerprint();
const drifted = await Page.load(
  `<html><body><div class="products"><article class="product card" id="p1"><div class="t"><h3>Widget</h3></div><span class="price">19.99</span></article></div></body></html>`,
);
const [moved] = drifted.relocate(fp);
console.log("relocated:", moved?.attrs.id, "| path:", moved?.path);
console.log("PROOF OK");

drifted.dispose();
page.dispose();
