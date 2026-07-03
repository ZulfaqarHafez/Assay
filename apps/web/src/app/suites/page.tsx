import { ProbeArrayArt } from "@/components/ui/EmptyArt";
import { getExamPackSummaries } from "@/lib/serverApi";
import type { ExamPackSummary } from "@/types/assay";
import { SuiteExportButton, SuiteImportControl } from "./SuiteActions";

export const dynamic = "force-dynamic";

/**
 * Test suites - the adversarial datasets agents are run against. Each pack is a
 * versioned set of probes with seen + held-out variants and documented checks.
 */
export default async function SuitesPage() {
  const { packs, error } = await loadSuites();

  return (
    <main className="ws-page">
      <header className="ws-head">
        <div>
          <h1>Test suites</h1>
          <p>Versioned datasets of adversarial probes with seen and held-out variants, graded against documented checks.</p>
        </div>
        <SuiteImportControl count={packs.length} />
      </header>

      {error ? (
        <div className="ws-empty-rich" role="alert">
          <ProbeArrayArt size={104} className="ws-empty-art" />
          <h2>Suites unavailable</h2>
          <p>{error}</p>
        </div>
      ) : packs.length === 0 ? (
        <div className="ws-empty-rich">
          <ProbeArrayArt size={104} className="ws-empty-art" />
          <h2>No suites registered</h2>
          <p>Test suites are versioned datasets of adversarial probes. Once registered, each suite and its coverage shows up here.</p>
        </div>
      ) : (
        <div className="ws-grid">
          {packs.map((pack) => {
            const competencies = pack.competencies;
            return (
              <article className="ws-card" key={pack.id}>
                <h2 className="ws-card-title">{pack.name}</h2>
                <p className="ws-card-sub mono">{pack.id}</p>
                <div className="ws-card-meta">
                  <span className="ws-chip accent">{pack.item_count} probes</span>
                  <span className="ws-chip">{competencies.length} competencies</span>
                  <span className="ws-chip">seen + held-out</span>
                </div>
                <div className="ws-card-meta">
                  {competencies.slice(0, 6).map((competency) => (
                    <span className="ws-chip" key={competency}>{labelize(competency)}</span>
                  ))}
                </div>
                <div className="ws-card-actions">
                  <SuiteExportButton packId={pack.id} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

async function loadSuites(): Promise<{ packs: ExamPackSummary[]; error: string | null }> {
  try {
    return { packs: await getExamPackSummaries(), error: null };
  } catch (exc) {
    return { packs: [], error: exc instanceof Error ? exc.message : "Could not load test suites." };
  }
}

function labelize(key: string) {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}
