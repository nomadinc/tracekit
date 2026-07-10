"use client";

import * as React from "react";
import { apiGetJson } from "@/lib/api";

type ProductType =
  | "physical"
  | "digital"
  | "service"
  | "warranty"
  | "shipping"
  | "upsell"
  | "order_bump";

type CatalogProduct = {
  id: number;
  platform: string;
  external_product_id: string | null;
  sku: string | null;
  name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  order_count: number;
  applied_product_cost?: number;
  revenue: number;
  resolved: boolean;
};

type ProductCostRule = {
  id: number;
  platform: string | null;
  product_name: string | null;
  sku: string | null;
  product_type: ProductType;
  package_quantity: number;
  package_cost: number;
  shipping_cost?: number;
  allow_unit_fallback: boolean;
  currency: string;
  is_active: boolean;
};

export default function ProductCostsPage() {
  const [products, setProducts] = React.useState<CatalogProduct[]>([]);
  const [rules, setRules] = React.useState<ProductCostRule[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [selectedProduct, setSelectedProduct] =
    React.useState<CatalogProduct | null>(null);

  const [productType, setProductType] =
    React.useState<ProductType>("physical");
    
  const [editingRule, setEditingRule] =
  	React.useState<ProductCostRule | null>(null);	
  	
  const [packageQuantity, setPackageQuantity] = React.useState(1);
  const [packageCost, setPackageCost] = React.useState("");
  const [shippingCost, setShippingCost] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [csvText, setCsvText] = React.useState("");
  const [csvPreview, setCsvPreview] = React.useState<any | null>(null);
  const [csvError, setCsvError] = React.useState<string | null>(null);
  const [csvImporting, setCsvImporting] = React.useState(false);

  function downloadCsvTemplate() {
	  const csv = [
	    "platform,product_name,sku,product_type,package_quantity,package_cost,shipping_cost",
	    "shopify,3x NAD+ Spray,NAD-3X,physical,3,12.50,4.95",
	    "shopify,1x NAD+ Spray,NAD-1X,physical,1,4.50,4.95",
	    "everflow,Warranty,,warranty,1,9.99,0",
	  ].join("\n");
	  
	
	  const blob = new Blob([csv], { type: "text/csv" });
	
	  const url = URL.createObjectURL(blob);
	
	  const a = document.createElement("a");
	  a.href = url;
	  a.download = "tracekit-product-cost-template.csv";
	  a.click();
	
	  URL.revokeObjectURL(url);
	}
	
	function openEditRule(rule: ProductCostRule) {
	  setEditingRule(rule);
	  setSelectedProduct(null);
	
	  setProductType(rule.product_type);
	  setPackageQuantity(rule.package_quantity);
	  setPackageCost(String(rule.package_cost || ""));
	  setShippingCost(String(rule.shipping_cost || ""));
	}
  function detectPackageQuantity(name?: string | null, sku?: string | null) {
	  const text = `${name || ""} ${sku || ""}`.toLowerCase();
	
	  const nameMatch = text.match(/\b([1-5])\s*x\b/);
	  if (nameMatch) return Number(nameMatch[1]);
	
	  const dashMatch = text.match(/[-_]([1-5])\b/);
	  if (dashMatch) return Number(dashMatch[1]);
	
	  return 1;
	}
	
	function normalizeBaseProductName(name?: string | null) {
	  return String(name || "Unknown Product")
	    .replace(/^\(\d+\)\s*/i, "")
	    .replace(/^\d+\s*x\s+/i, "")
	    .replace(/\s+-\s+[1-5]$/i, "")
	    .replace(/\s{2,}/g, " ")
	    .trim();
	}
	
	function findCostRule(product: CatalogProduct, rules: ProductCostRule[]) {
	  const qty = detectPackageQuantity(product.name, product.sku);
	  const baseName = normalizeBaseProductName(product.name);
	
	  return rules.find((r) => {
	    const platformMatch = r.platform === product.platform;
	    const qtyMatch = Number(r.package_quantity || 1) === qty;
	
	    const skuMatch =
	      r.sku &&
	      product.sku &&
	      r.sku.toLowerCase() === product.sku.toLowerCase();
	
	    const nameMatch =
	      r.product_name &&
	      (
	        r.product_name.toLowerCase() === String(product.name || "").toLowerCase() ||
	        r.product_name.toLowerCase() === baseName.toLowerCase()
	      );
	
	    return platformMatch && qtyMatch && (skuMatch || nameMatch);
	  });
	}
	
	function money(n: number) {
	  return `$${Number(n || 0).toFixed(2)}`;
	}
	
	async function handleCsvFile(file: File) {
	  const text = await file.text();
	
	  setCsvText(text);
	  setCsvPreview(null);
	  setCsvError(null);
	}

async function previewCsvImport() {
  if (!csvText.trim()) {
    setCsvError("Upload a CSV first.");
    return;
  }

  try {
    setCsvError(null);

    const res = await fetchApi("/v1/product-costs/import/preview", {
      method: "POST",
      body: JSON.stringify({
        csv: csvText,
      }),
    });

    setCsvPreview(res);
  } catch (err: any) {
    setCsvError(err.message || "Preview failed");
  }
}

async function importCsvCosts() {
  if (!csvText.trim()) {
    setCsvError("Upload a CSV first.");
    return;
  }

  try {
    setCsvImporting(true);
    setCsvError(null);

    await fetchApi("/v1/product-costs/import", {
      method: "POST",
      body: JSON.stringify({
        csv: csvText,
      }),
    });

    setCsvText("");
    setCsvPreview(null);

    await load();
  } catch (err: any) {
    setCsvError(err.message || "Import failed");
  } finally {
    setCsvImporting(false);
  }
}

  async function load() {
    setLoading(true);

    try {
      const [productsResp, rulesResp] = await Promise.all([
        apiGetJson<any>("/v1/product-catalog"),
        apiGetJson<any>("/v1/product-costs/rules"),
      ]);

      setProducts(productsResp.products || []);
      setRules(rulesResp.rules || []);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  const configuredProducts = new Set(
    rules.map((r) => `${r.platform || ""}|${r.sku || ""}|${r.product_name || ""}`),
  );

  const totalProducts = products.length;

  const configuredCount = products.filter((p) =>
    configuredProducts.has(`${p.platform}|${p.sku || ""}|${p.name || ""}`),
  ).length;

  const missingCount = totalProducts - configuredCount;
  
  const productsWithCosts = products.map((p) => {
  const rule = findCostRule(p, rules);

  const estimatedCogs = rule
    ? Number(p.order_count || 0) * Number(rule.package_cost || 0)
    : 0;

  const estimatedShipping = rule
    ? Number(p.order_count || 0) * Number(rule.shipping_cost || 0)
    : 0;

  const estimatedTotalCost = estimatedCogs + estimatedShipping;
  const estimatedProfit = Number(p.revenue || 0) - estimatedTotalCost;

  const marginPct =
    Number(p.revenue || 0) > 0
      ? (estimatedProfit / Number(p.revenue || 0)) * 100
      : 0;

  return {
    ...p,
    base_name: normalizeBaseProductName(p.name),
    package_quantity: detectPackageQuantity(p.name, p.sku),
    cost_rule: rule,
    estimated_cogs: estimatedCogs,
    estimated_shipping: estimatedShipping,
    estimated_profit: estimatedProfit,
    margin_pct: marginPct,
  };
});

const groupedProducts = productsWithCosts.reduce((acc: any[], p) => {
  const key = `${p.platform}|${p.sku || ""}|${p.base_name}`;

  let group = acc.find((g) => g.key === key);

  if (!group) {
    group = {
      key,
      platform: p.platform,
      name: p.base_name,
      sku: p.sku,
      products: [],
      order_count: 0,
      revenue: 0,
      estimated_cogs: 0,
      estimated_shipping: 0,
      estimated_profit: 0,
      has_cost: false,
    };

    acc.push(group);
  }

  group.products.push(p);
  group.order_count += Number(p.order_count || 0);
  group.revenue += Number(p.revenue || 0);
  group.estimated_cogs += Number(p.estimated_cogs || 0);
  group.estimated_shipping += Number(p.estimated_shipping || 0);
  group.estimated_profit += Number(p.estimated_profit || 0);
  group.has_cost = group.has_cost || Boolean(p.cost_rule);

  return acc;
}, []);

const revenueCovered = productsWithCosts
  .filter((p) => p.cost_rule)
  .reduce((sum, p) => sum + Number(p.revenue || 0), 0);

const totalRevenue = productsWithCosts.reduce(
  (sum, p) => sum + Number(p.revenue || 0),
  0,
);

const ordersCovered = productsWithCosts
  .filter((p) => p.cost_rule)
  .reduce((sum, p) => sum + Number(p.order_count || 0), 0);

const totalOrders = productsWithCosts.reduce(
  (sum, p) => sum + Number(p.order_count || 0),
  0,
);

const revenueCoveragePct =
  totalRevenue > 0 ? Math.round((revenueCovered / totalRevenue) * 100) : 0;

const orderCoveragePct =
  totalOrders > 0 ? Math.round((ordersCovered / totalOrders) * 100) : 0;

  

  function openCostModal(product: CatalogProduct) {
    setSelectedProduct(product);
    setProductType(inferProductType(product));
    setPackageQuantity(inferPackageQuantity(product.name || ""));
    setPackageCost("");
    setShippingCost("");
  }

  async function saveCostRule() {
	  if (!selectedProduct && !editingRule) return;
	
	  setSaving(true);
	
	  try {
	    const isEditing = Boolean(editingRule);
	
	    await fetchApi(
	      isEditing
	        ? "/v1/product-costs/rules/update"
	        : "/v1/product-costs/rules",
	      {
	        method: "POST",
	        body: JSON.stringify({
	          id: editingRule?.id,
	          platform: selectedProduct?.platform || editingRule?.platform,
	          product_name: selectedProduct?.name || editingRule?.product_name,
	          sku: selectedProduct?.sku || editingRule?.sku,
	          product_type: productType,
	          package_quantity: packageQuantity,
	          package_cost: Number(packageCost || 0),
	          shipping_cost: shouldShowShipping(productType)
	            ? Number(shippingCost || 0)
	            : 0,
	          allow_unit_fallback: false,
	          currency: "USD",
	          is_active: true,
	        }),
	      },
	    );
	
	    setSelectedProduct(null);
	    setEditingRule(null);
	    await load();
	  } finally {
	    setSaving(false);
	  }
	}
  
  async function deleteCostRule(id: number) {
	  const confirmed = window.confirm(
	    "Delete this cost rule? This cannot be undone.",
	  );
	
	  if (!confirmed) return;
	
	  await fetchApi("/v1/product-costs/rules/delete", {
	    method: "POST",
	    body: JSON.stringify({ id }),
	  });
	
	  await load();
	}

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Product Costs</h1>
        <p className="text-sm text-slate-500">
          Configure product cost rules used for profit calculations.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border p-6">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <MetricCard label="Products Discovered" value={totalProducts} />
            <MetricCard label="With Cost Rules" value={configuredCount} />
            <MetricCard label="Missing Cost Rules" value={missingCount} />
            <MetricCard label="Revenue Coverage" value={`${revenueCoveragePct}%`} />
          </div>
		  
		  <div className="rounded-xl border p-4">
			  <div className="flex items-center justify-between">
			    <div>
			      <h2 className="text-lg font-semibold">
			        Bulk Import Product Costs
			      </h2>
			
			      <p className="text-sm text-slate-500">
			        Upload a CSV and import hundreds of product
			        cost rules at once.
			      </p>
			    </div>
			
			    <button
			      className="rounded-md border px-3 py-2 text-sm"
			      onClick={downloadCsvTemplate}
			    >
			      Download Template
			    </button>
			  </div>
			
			  <div className="mt-4">
			    <input
			      type="file"
			      accept=".csv"
			      onChange={(e) => {
			        const file = e.target.files?.[0];
			        if (file) {
			          handleCsvFile(file);
			        }
			      }}
			    />
			  </div>
			
			  {csvError && (
			    <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
			      {csvError}
			    </div>
			  )}
			
			  {csvText && (
			    <div className="mt-4 flex gap-2">
			      <button
			        className="rounded-md border px-3 py-2 text-sm"
			        onClick={previewCsvImport}
			      >
			        Preview Import
			      </button>
			
			      <button
			        className="rounded-md bg-black px-3 py-2 text-sm text-white"
			        onClick={importCsvCosts}
			        disabled={csvImporting}
			      >
			        {csvImporting ? "Importing..." : "Import Costs"}
			      </button>
			    </div>
			  )}
			
			  {csvPreview && (
			    <div className="mt-4 rounded-md border p-3 text-sm">
			      <div>
			        Rows Found:{" "}
			        <strong>{csvPreview.total_rows}</strong>
			      </div>
			
			      <div>
			        New Rules:{" "}
			        <strong>{csvPreview.new_rules}</strong>
			      </div>
			
			      <div>
			        Updates:{" "}
			        <strong>{csvPreview.updates}</strong>
			      </div>
			    </div>
			  )}
			</div>
		  
          <div className="rounded-xl border p-4">
            <h2 className="mb-1 text-lg font-semibold">Product Catalog</h2>
            <p className="mb-4 text-sm text-slate-500">
              Products discovered from platform orders. Add cost rules to enable profit calculations.
            </p>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
				  <tr>
				    <th className="text-left p-2">Platform</th>
				    <th className="text-left p-2">Product</th>
				    <th className="text-left p-2">SKU</th>
				    <th className="text-left p-2">Orders</th>
				    <th className="text-left p-2">Revenue</th>
				    <th className="text-left p-2">COGS</th>
				    <th className="text-left p-2">Shipping</th>
				    <th className="text-left p-2">Gross Profit</th>
				    <th className="text-left p-2">Margin</th>
				    <th className="text-left p-2">Status</th>
				    <th className="text-left p-2">Action</th>
				  </tr>
				</thead>

                <tbody>
                  {groupedProducts.map((p) => {
				  
				  return (
                      <tr
						  key={p.key || `${p.platform}-${p.sku || ""}-${p.name || ""}`}
						  className="border-t"
						>
                        <td className="p-2">{p.platform}</td>
						<td className="p-2">{p.name}</td>
						<td className="p-2">{p.sku || "—"}</td>
						<td className="p-2">{p.order_count}</td>
						<td className="p-2">{money(p.revenue)}</td>
						<td className="p-2">{money(p.estimated_cogs)}</td>
						<td className="p-2">{money(p.estimated_shipping)}</td>
						<td className="p-2">{money(p.estimated_profit)}</td>
						<td className="p-2">
						  {p.revenue > 0
						    ? `${((p.estimated_profit / p.revenue) * 100).toFixed(1)}%`
						    : "—"}
						</td>
						<td className="p-2">
						  {p.has_cost ? (
						    <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
						      Cost Set
						    </span>
						  ) : (
						    <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-700">
						      Missing Cost
						    </span>
						  )}
						</td>
                        <td className="p-2">
                          <button
							  className="rounded-md border px-3 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
							  onClick={() => openCostModal(p)}
							>
							  {p.has_cost ? "Edit Cost" : "Set Cost"}
						  </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <h2 className="mb-4 text-lg font-semibold">Existing Cost Rules</h2>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-2">Product</th>
                    <th className="text-left p-2">SKU</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Qty</th>
                    <th className="text-left p-2">Cost</th>
                    <th className="text-left p-2">Shipping</th>
                    <th className="text-left p-2">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {rules.map((rule) => (
				  <tr key={rule.id} className="border-t">
				    <td className="p-2">{rule.product_name}</td>
				    <td className="p-2">{rule.sku || "—"}</td>
				    <td className="p-2">{formatProductType(rule.product_type)}</td>
				    <td className="p-2">{rule.package_quantity}x</td>
				    <td className="p-2">${Number(rule.package_cost).toFixed(2)}</td>
				    <td className="p-2">${Number(rule.shipping_cost || 0).toFixed(2)}</td>
				    <td className="p-2">
					  <button
					    className="mr-2 rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
					    onClick={() => openEditRule(rule)}
					  >
					    Edit
					  </button>
					
					  <button
					    className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
					    onClick={() => deleteCostRule(rule.id)}
					  >
					    Delete
					  </button>
					</td>
				  </tr>
				))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {(selectedProduct || editingRule) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl border bg-white p-6 shadow-xl dark:bg-ink">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">
				  {editingRule ? "Edit Product Cost" : "Set Product Cost"}
			  </h2>
              <p className="text-sm text-slate-500">
                Create a cost rule for this product.
              </p>
            </div>

            <div className="mb-4 rounded-lg border p-3 text-sm">
              <div className="font-semibold">
				  {selectedProduct?.name ||
				    editingRule?.product_name ||
				    "—"}
			  </div>
              <div className="mt-1 text-slate-500">
				  Platform: {selectedProduct?.platform || editingRule?.platform || "—"} · SKU:{" "}
				  {selectedProduct?.sku || editingRule?.sku || "—"} · Product ID:{" "}
				  {selectedProduct?.external_product_id || "—"}
			  </div>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-1 text-sm">
                Product Type
                <select
                  className="rounded-md border bg-white px-3 py-2 dark:bg-slate-900"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value as ProductType)}
                >
                  <option value="physical">Physical Product</option>
                  <option value="digital">Digital Product</option>
                  <option value="warranty">Warranty</option>
                  <option value="shipping">Shipping</option>
                  <option value="upsell">Upsell</option>
                  <option value="order_bump">Order Bump</option>
                  <option value="service">Service</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                Package Quantity
                <input
                  className="rounded-md border px-3 py-2"
                  type="number"
                  min="1"
                  value={packageQuantity}
                  onChange={(e) => setPackageQuantity(Number(e.target.value || 1))}
                />
              </label>

              <label className="grid gap-1 text-sm">
                Product Cost
                <input
                  className="rounded-md border px-3 py-2"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={packageCost}
                  onChange={(e) => setPackageCost(e.target.value)}
                />
              </label>

              {shouldShowShipping(productType) && (
                <label className="grid gap-1 text-sm">
                  Shipping Cost
                  <input
                    className="rounded-md border px-3 py-2"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                  />
                </label>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
				  className="rounded-md border px-4 py-2"
				  onClick={() => {
				    setSelectedProduct(null);
				    setEditingRule(null);
				  }}
				  disabled={saving}
				>
				  Cancel
			</button>

              <button
                className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-60 dark:bg-white dark:text-black"
                onClick={saveCostRule}
                disabled={saving}
              >
                {saving
				  ? "Saving..."
				  : editingRule
				    ? "Save Changes"
				    : "Save Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

async function fetchApi(path: string, init?: RequestInit) {
  const base =
    process.env.NEXT_PUBLIC_API_BASE ||
    "https://tracekit-api.anthony-d15.workers.dev";

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const json = await res.json();

  if (!res.ok || json?.ok === false) {
    throw new Error(json?.message || "Request failed");
  }

  return json;
}

function shouldShowShipping(type: ProductType) {
  return type === "physical" || type === "upsell" || type === "order_bump";
}

function inferPackageQuantity(name: string) {
  const match = name.match(/^\s*(\d+)\s*x/i);
  return match ? Number(match[1]) : 1;
}

function inferProductType(product: CatalogProduct): ProductType {
  const name = `${product.name || ""} ${product.sku || ""}`.toLowerCase();

  if (name.includes("warranty")) return "warranty";
  if (name.includes("shipping")) return "shipping";
  if (name.includes("digital")) return "digital";
  if (name.includes("bump")) return "order_bump";
  if (name.includes("upsell")) return "upsell";

  return "physical";
}

function formatProductType(type: ProductType) {
  return type
    .replace("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

