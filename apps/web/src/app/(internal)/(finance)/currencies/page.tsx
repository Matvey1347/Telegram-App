'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { currenciesApi, Currency, CurrencyDisplayMode } from '@/lib/api';
import { Button, Card, CurrencySelect, FormField, LoadingState, PageHeader, Select } from '@/components/ui/primitives';

export default function CurrenciesPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading: loadingSettings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const showInitialLoading = loadingSettings && !settings;

  const saveSettings = useMutation({
    mutationFn: currenciesApi.updateSettings,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['currency-settings'] }),
        qc.invalidateQueries({ queryKey: ['currency-rates-latest'] }),
        qc.invalidateQueries({ queryKey: ['accounts'] }),
        qc.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
    },
  });
  return (
    <AppShell>
      <PageHeader
        title="Currencies"
        subtitle="Choose workspace display currencies; official rates are maintained system-wide."
      />

      {showInitialLoading ? <LoadingState /> : null}
      {settings ? <CurrencySettingsCard key={`${settings.primaryCurrency}-${settings.secondaryCurrency}-${settings.tertiaryCurrency}-${settings.currencyDisplayMode}`} settings={settings} onSave={(payload) => saveSettings.mutate(payload)} /> : null}
    </AppShell>
  );
}

function CurrencySettingsCard({ settings, onSave }: { settings: { primaryCurrency: Currency; secondaryCurrency: Currency; tertiaryCurrency: Currency; currencyDisplayMode: CurrencyDisplayMode; supportedCurrencies: Currency[] }; onSave: (v: { primaryCurrency: Currency; secondaryCurrency: Currency; tertiaryCurrency: Currency; currencyDisplayMode: CurrencyDisplayMode }) => void }) {
  const [primaryCurrency, setPrimaryCurrency] = useState<Currency>(settings.primaryCurrency);
  const [secondaryCurrency, setSecondaryCurrency] = useState<Currency>(settings.secondaryCurrency);
  const [tertiaryCurrency, setTertiaryCurrency] = useState<Currency>(settings.tertiaryCurrency ?? 'UAH');
  const [currencyDisplayMode, setCurrencyDisplayMode] = useState<CurrencyDisplayMode>(settings.currencyDisplayMode);

  return (
    <Card>
      <h3 className="mb-4 text-lg font-semibold">Currency settings</h3>
      <form
        className="grid gap-3 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ primaryCurrency: primaryCurrency.toUpperCase(), secondaryCurrency: secondaryCurrency.toUpperCase(), tertiaryCurrency: tertiaryCurrency.toUpperCase(), currencyDisplayMode });
        }}
      >
        <FormField label="Primary currency">
          <CurrencySelect value={primaryCurrency} onChange={setPrimaryCurrency} currencies={settings.supportedCurrencies} />
        </FormField>
        <FormField label="Secondary currency">
          <CurrencySelect value={secondaryCurrency} onChange={setSecondaryCurrency} currencies={settings.supportedCurrencies} />
        </FormField>
        <FormField label="Third currency">
          <CurrencySelect value={tertiaryCurrency} onChange={setTertiaryCurrency} currencies={settings.supportedCurrencies} />
        </FormField>
        <FormField label="Display">
          <Select value={currencyDisplayMode} onChange={(e) => setCurrencyDisplayMode(e.target.value as CurrencyDisplayMode)}>
            <option value="code">Code</option>
            <option value="symbol">Symbol</option>
          </Select>
        </FormField>
        <div className="flex items-end">
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Card>
  );
}
