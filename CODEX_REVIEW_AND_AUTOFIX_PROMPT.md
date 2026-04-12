# Fuld kodegennemgang + Codex autopilot-prompt (DISC Engine)

Dette dokument opsummerer en teknisk gennemgang af repoet og giver en klar, genbrugelig prompt, så Codex kan køre en struktureret forbedringsrunde og selv lave sikre opdateringer.

## Kort status på repoet

- Monorepoet har en tydelig lagdeling (domain/application/infrastructure/api), hvilket er et stærkt fundament.
- Domænelaget er relativt rent og testbart.
- Der er gode livscyklus-regler for versionering/publish af assessment/report templates.
- Multi-tenant er indført, men der er enkelte steder, hvor tenant-filtering og type-sikkerhed bør strammes.

## Vigtigste fund (prioriteret)

1. **Tenant-afgrænsning skal håndhæves konsekvent**
   - Risiko: data-eksponering på tværs af tenants, hvis et query mangler tenant-filter.
   - Eksempel fundet og rettet: session summary query manglede tenantId i where-clause.

2. **Type-sikkerhed i Prisma-mapping kan styrkes**
   - Risiko: skjulte runtime-fejl ved schemaændringer.
   - Eksempel fundet og rettet: `any` i result read-model mapping erstattet med konkret Prisma payload-type.

3. **Manglende automatiseret kvalitet-gate i CI-flow**
   - Der bør sikres konsekvent kørsel af typecheck, tests og lint på alle pakker i pull requests.

4. **Teknisk gæld markeret som TODOs**
   - Auth/permission checks for admin-flow.
   - Dybdevalidering af response values baseret på question type.
   - Arkivstrategi ved sletning/ændring af historiske objekter.

## Målbillede for næste Codex-runde

- Ingen tenant-lækager (alle læse/skriv queries scoped).
- Strammere compile-time typer i infrastructure mappings.
- Bedre validering af API-input og domæneinvarianter.
- Reproducerbar kvalitetskørsel med klare “pass/fail” checks.

## Klar-til-brug prompt til Codex

Kopiér prompten herunder direkte til Codex:

```text
Du er min senior TypeScript/Prisma/Fastify code-maintainer.

Kontekst:
- Repo: DISC Engine monorepo
- Lag: domain, application, infrastructure, apps/api
- Fokus: robusthed, multi-tenant sikkerhed, type-sikkerhed og vedligeholdbarhed

Din opgave (kør i denne rækkefølge):

1) Repo-audit
- Scan hele repoet for:
  a) Manglende tenant-scoping i DB-queries
  b) Brug af `any`/usikre type-casts i infra mappings
  c) Svage valideringer i API-ruter/use-cases
  d) Døde TODOs med produktionsrisiko
- Lav en prioriteret liste: Critical / High / Medium / Low.

2) Foreslå og implementér rettelser
- Implementér kun sikre, bagudkompatible ændringer i første omgang.
- For hver rettelse:
  - Forklar root cause kort
  - Beskriv ændringen
  - Vurder risiko og påvirkede lag

3) Kvalitetskontrol
- Kør relevante checks (typecheck, tests, lint).
- Hvis noget ikke kan køres i miljøet, dokumentér præcist hvorfor.

4) Leveranceformat
- Giv output i Markdown med sektionerne:
  - Summary
  - Findings (prioriteret)
  - Changes made
  - Validation/Testing
  - Remaining risks / Next steps
- Inkludér konkrete filreferencer pr. ændring.
- Hold forklaringer korte, men teknisk præcise.

Vigtige regler:
- Ingen sweeping refactors uden begrundelse.
- Ingen ændring af public API-kontrakter uden tydelig note.
- Foretræk små, review-venlige commits.
- Når du er i tvivl: vælg den mindst risikable ændring og forklar tradeoff.
```

## Anbefalet arbejdscyklus fremadrettet

1. Kør prompten ovenfor i små iterationer (max 3–6 filer pr. ændringsrunde).
2. Merge kun når typecheck + tests + lint er grønne.
3. Lav separat runde for større designændringer (ikke blandet med bugfixes).
4. Genbrug samme prompt som “maintenance sprint” hver uge.
