import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  BlockStack,
  Banner,
  Text,
} from "@shopify/polaris";
import { useState } from "react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateShopSettings } from "../lib/plp/service.server";
import prisma from "../db.server";
import { listLocaleIds } from "../../config/locales";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getOrCreateShopSettings(session.shop);
  return {
    settings,
    locales: listLocaleIds(),
    llmProvider: process.env.LLM_PROVIDER ?? "anthropic",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  await prisma.shopSettings.update({
    where: { shop: session.shop },
    data: {
      defaultLocales: String(form.get("defaultLocales") ?? "en-us"),
      brandTone: String(form.get("brandTone") ?? ""),
      competitorUrls: String(form.get("competitorUrls") ?? ""),
      minProductCount: Number(form.get("minProductCount") ?? 6),
      similarityThreshold: Number(form.get("similarityThreshold") ?? 0.85),
      llmProvider: String(form.get("llmProvider") ?? "anthropic"),
    },
  });
  return { ok: true };
};

export default function SettingsPage() {
  const { settings, locales, llmProvider } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [brandTone, setBrandTone] = useState(settings.brandTone);
  const [competitors, setCompetitors] = useState(settings.competitorUrls ?? "");
  const [defaultLocales, setDefaultLocales] = useState(settings.defaultLocales);
  const [minProducts, setMinProducts] = useState(String(settings.minProductCount));
  const [similarity, setSimilarity] = useState(String(settings.similarityThreshold));
  const [provider, setProvider] = useState(settings.llmProvider);

  return (
    <Page>
      <TitleBar title="Settings" />
      <BlockStack gap="500">
        {actionData?.ok && <Banner tone="success">Settings saved.</Banner>}
        <Card>
          <Form method="post">
            <FormLayout>
              <Text as="p" variant="bodyMd">
                Active LLM from environment: <strong>{llmProvider}</strong> (set LLM_PROVIDER in .env)
              </Text>
              <Select
                label="Preferred provider (stored)"
                options={[
                  { label: "Anthropic Claude", value: "anthropic" },
                  { label: "OpenAI GPT-4o", value: "openai" },
                  { label: "Google Gemini", value: "gemini" },
                ]}
                value={provider}
                onChange={setProvider}
                name="llmProvider"
              />
              <Select
                label="Default locales (comma-separated)"
                options={locales.map((l) => ({ label: l, value: l }))}
                value={defaultLocales.split(",")[0] ?? "en-us"}
                onChange={(v) => setDefaultLocales(v)}
                name="defaultLocales"
              />
              <input type="hidden" name="defaultLocales" value={defaultLocales} />
              <TextField label="Brand tone" value={brandTone} onChange={setBrandTone} name="brandTone" autoComplete="off" multiline={2} />
              <TextField label="Competitor URLs (comma-separated)" value={competitors} onChange={setCompetitors} name="competitorUrls" autoComplete="off" />
              <TextField label="Min products to publish" type="number" value={minProducts} onChange={setMinProducts} name="minProductCount" autoComplete="off" />
              <TextField label="Similarity block threshold (0-1)" value={similarity} onChange={setSimilarity} name="similarityThreshold" autoComplete="off" />
              <Button submit variant="primary">
                Save
              </Button>
            </FormLayout>
          </Form>
        </Card>
      </BlockStack>
    </Page>
  );
}
