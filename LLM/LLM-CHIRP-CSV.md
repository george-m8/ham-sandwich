# Ham Sandwich — CHIRP CSV Generator

> LLM-powered frequency list workspace for creating, editing, merging, normalising, and publishing CHIRP-compatible channel lists.

## Related Documents

| Document | Description |
|---|---|
| [LLM-OVERVIEW.md](LLM-OVERVIEW.md) | High-level project overview |
| [LLM-SITE.md](LLM-SITE.md) | Site architecture and UI |
| [LLM-FIREBASE.md](LLM-FIREBASE.md) | User data persistence (saved keys, CSVs) |
| [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) | Worker API for LLM proxying |

---

## What Is CHIRP?

[CHIRP](https://chirp.danplanet.com) is an open-source tool for programming amateur radios. It uses a CSV format to represent channel lists that can be imported into hundreds of supported radios. By generating valid CHIRP CSV files via LLM, we let users quickly populate their radios with interesting, curated frequency lists tailored to their interests and location.

This project now treats CHIRP output as an **iterative list-building workflow** rather than a single one-shot generation. Users can build candidate lists, merge and adjust them, run naming normalisation, and save a finalised list while still preserving individual frequencies for discovery.

---

## Product Goals (Reworked)

Core capabilities:

1. **Create / update / merge / adjust lists** within a list workspace.
2. **Save a finalised list** as the exportable "release" artifact.
3. **Save individual list items** (channels) into the public directory index for future search and reuse.
4. **Search both lists and individual frequencies** from directory tooling.

Additional capability goals:

- Assign **NFM** mode where appropriate (for example PMR446 ranges).
- Provide configurable **merge duplicate handling** when combining lists.
- Provide a **station renaming tool** driven by an LLM prompt/ruleset (for example all caps, max length, descriptive names).
- Preserve **location-specific meaning** for shared frequencies (same frequency can have different labels/comments by location).

---

## User Flow

```
┌──────────────────────────────────────────────────────┐
│                  User Opens /chirp-csv                │
│                                                      │
│  1. Create list workspace or open existing draft      │
│  2. Select LLM provider + model + API key             │
│  3. Configure generation options + location            │
│  4. Generate candidate list                            │
│  5. Adjust list items manually (edit/add/remove)       │
│  6. Optional tools:                                    │
│     • Merge with another list                          │
│     • Merge duplicate policy                           │
│     • Rename station names via LLM rules              │
│     • Re-run validation / normalisation                │
│  7. Save list as finalised                             │
│                                                      │
│  ┌────────────────────────────────────┐               │
│  │      LOADING / TOOL EXECUTION      │               │
│  └────────────────────────────────────┘               │
│                                                      │
│  8. Final output:                                     │
│     • CSV preview + validation report                 │
│     • [Download CSV]                                  │
│     • Finalised list saved to directory               │
│     • Individual channels indexed in directory        │
│     • [★ Favourite] list or frequency entry (login-   │
│       gated; stored in account only)                  │
└──────────────────────────────────────────────────────┘
```

---

## LLM Provider Integration

### Supported Providers

| Provider | Model Examples | API Base |
|---|---|---|
| OpenAI | gpt-4o, gpt-4o-mini | `https://api.openai.com/v1` |
| Google Gemini | gemini-2.0-flash, gemini-2.5-pro | `https://generativelanguage.googleapis.com` |
| Anthropic Claude | claude-sonnet-4-20250514, claude-3.5-haiku | `https://api.anthropic.com/v1` |
| xAI Grok | grok-3, grok-3-mini | `https://api.x.ai/v1` |
| GitHub Models | gpt-4.1-mini, gpt-4.1, Meta-Llama-3.1-70B-Instruct | `https://models.inference.ai.azure.com` |

### GitHub Models Notes

- Use a GitHub Personal Access Token with GitHub Models / AI inference access.
- Model IDs for this endpoint are configured in `data/chirp-options.json` under `providers.github.models`.
- For GitHub Models, use model names as expected by the endpoint (for example `gpt-4.1-mini`), not provider-prefixed forms like `openai/...`.
- Switching the provider to **GitHub Models** triggers an automatic model discovery attempt after the provider key is loaded.
- Use **Load available models** to manually fetch your live provider model list (`POST /api/llm/models`) and repopulate the model dropdown.
- If discovery fails, the UI keeps the configured model list and shows a friendly status message.

### Pydantic AI

We use **Pydantic AI** to provide a unified interface across LLM providers. This gives us:

- **Structured output**: Define response schemas that all providers must conform to
- **Provider abstraction**: Swap providers without changing business logic
- **Validation**: Automatic response validation against our Pydantic models
- **Retry logic**: Built-in retry with exponential backoff on provider errors

The Pydantic AI agent runs **server-side** in a Cloudflare Worker (Python via `cloudflare-workers` Python support, or proxied to a lightweight API). See [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md) for deployment details.

### API Key Handling

1. **Not logged in**: User enters API key in the form. Key is sent to the Cloudflare Worker, used for the request, and **never stored server-side**.
2. **Logged in**: User can save API keys to their Firebase profile (encrypted — see [LLM-FIREBASE.md](LLM-FIREBASE.md)). The saved key is retrieved client-side and sent with the request.
3. The Cloudflare Worker receives the key, makes the LLM request, and returns the result. **The key is not logged or persisted by the Worker.**

### Logging & Telemetry

For CHIRP generation endpoints and UI events, use structured logs and redact sensitive content:

- Log event lifecycle: `generation_started`, `list_updated`, `merge_completed`, `rename_completed`, `validation_completed`, `list_saved`, `generation_failed`
- Include only safe metadata: provider, selected bands/modes, validation level, duration, channel counts
- Do not log API keys, auth tokens, raw prompt text, full LLM response bodies, or full CSV content
- For troubleshooting, log prompt/response sizes and hashed identifiers rather than raw content

Implementation and platform-level logging policy is defined in [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md).

---

## Options Form

> **Styling:** All form elements must use the `receipt-css` component classes (see [LLM-SITE.md](LLM-SITE.md)). Use `.form-row` for field layout, `.dropdown` for select inputs, standard `receipt-css` input styles for text/number/password fields, and `.output-box` for the generated CSV preview and validation report.

### Form Fields

| Field | Type | Default | Description |
|---|---|---|---|
| LLM Provider | Dropdown | OpenAI | Which LLM to use |
| API Key | Text input | (empty) | User's API key for selected provider |
| Model | Dropdown | Provider default | Model to use for selected provider |
| Load available models | Button | N/A | Fetches provider-supported models and repopulates model dropdown |
| Web Search | Toggle | Enabled when supported | Automatically disabled for models without web search support |
| Frequency Range Min | Number (MHz) | 0.5 | Lower bound of frequency range |
| Frequency Range Max | Number (MHz) | 1300 | Upper bound of frequency range |
| Mode | Multi-select checkboxes | FM, AM | FM, AM, DMR, SSB, CW |
| Include Repeaters | Toggle | Yes | Whether to include repeater frequencies |
| Bands | Multi-select checkboxes | All | HF, VHF, UHF, or All |
| Region / Location | Text input | (auto-detected) | User's location for local frequencies |
| Number of Channels | Number slider | 25 | How many channels to generate (10–100) |
| Prompt | Textarea | "Interesting radio frequencies local to {location}" | User's description of what they want |
| Validation Level | Dropdown | Standard | None / Standard / Strict |

### List Workspace Tools

In addition to generation form controls, include a tools section for list operations:

| Tool | Purpose |
|---|---|
| Save Draft | Save in-progress list edits without finalising |
| Merge Lists | Combine current list with selected list/source |
| Duplicate Policy | Choose how duplicates are handled during merge |
| Rename Stations | Apply naming rules via LLM or deterministic formatting |
| Finalise List | Mark list as final and publish to directory index |

Duplicate policy options during merge:

- Keep first
- Keep latest
- Keep both (suffix names)
- Merge metadata (preserve location variants)

Top-row order is:

1. Provider
2. API Key
3. Model
4. Web Search

The CSV **Download** button is shown below the CSV preview section.

### Location Auto-Detection

The location field is pre-filled using:

1. **Cloudflare `cf-ipcountry` header** — gives country code (e.g., `GB`)
2. **Cloudflare `cf.city` and `cf.region`** — available in Worker `request.cf` object for more specific location
3. **Fallback**: IP-based geolocation via a free API (e.g., `ipapi.co`) if Cloudflare data insufficient

The user can always override the auto-detected location.

---

## Prompt Construction

The user's form selections and prompt are combined into operation-specific prompts.

### A) Generate List Prompt

```
You are an expert amateur radio frequency database assistant.

Generate a list of {num_channels} radio frequencies for the CHIRP radio 
programming software.

REQUIREMENTS:
- Region/Location: {location}
- Frequency range: {freq_min} MHz to {freq_max} MHz 
- Modes to include: {modes}
- Include repeaters: {repeaters_yn}
- Bands: {bands}

USER REQUEST:
{user_prompt}

RESPONSE FORMAT:
Respond with a JSON array of objects. Each object represents one channel 
and must have these fields:

{
  "channels": [
    {
      "name": "string (max {max_name_length} chars, descriptive short name)",
      "frequency": "number (in MHz, e.g. 145.500)",
      "duplex": "string (one of: '', '+', '-', 'split')",
      "offset": "number (duplex offset in MHz, e.g. 0.600)",
      "tone_mode": "string (one of: '', 'Tone', 'TSQL', 'DTCS')",
      "r_tone_freq": "number (receive CTCSS tone in Hz, e.g. 88.5)",
      "t_tone_freq": "number (transmit CTCSS tone in Hz, e.g. 88.5)",
      "dtcs_code": "number (DCS code, e.g. 23)",
      "mode": "string (one of: 'FM', 'AM', 'NFM', 'DV', 'USB', 'LSB', 'CW')",
      "comment": "string (brief description of what this frequency is)"
    }
  ]
}

RULES:
- Only include real, known frequencies. Do not invent frequencies.
- Names must be unique and descriptive (max {max_name_length} characters).
- For repeaters, set appropriate duplex direction and offset.
- Include appropriate tone settings for repeaters that require them.
- All frequencies must be within the specified range.
- {additional_mode_rules}
- Respond ONLY with the JSON. No other text.
```

### B) Rename Stations Prompt

Used by the station renaming tool for systematic naming:

```
You are standardising station/channel names for CHIRP.

INPUT CHANNELS:
{channel_payload}

RENAME RULES:
- Max length: {max_name_length} characters
- Style: ALL CAPS
- Be descriptive and concise
- Preserve uniqueness within the list
- Do not alter frequency or technical fields

Return JSON only:
{
  "channels": [
    { "id": "<original id>", "name": "NEWNAME" }
  ]
}
```

### C) Merge/Normalise Prompt (Optional)

When merge policy is `merge metadata`, an LLM pass may consolidate conflicting descriptive text while preserving location context.

### Additional Mode-Specific Rules

If **DMR** is selected:
```
- For DMR repeaters, include the "digital_code" / colour code if known.
- Set mode to "DV" for digital voice channels.
```

If **repeaters excluded**:
```
- Do not include any repeater frequencies. Only simplex and broadcast/utility.
```

If **NFM auto-assignment enabled**:
```
- Assign mode "NFM" where the frequency is typically narrowband (for example PMR446 channels).
- Do not force NFM globally; apply only where appropriate for the band/service.
```

---

## Response Processing Pipeline

```
List Operation Request (generate / merge / rename)
    │
    ▼
┌─────────────────────┐
│  1. Source Ingest     │  Load current list + optional merge source
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  2. JSON Extraction   │  Strip markdown fencing, find JSON payload
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  3. JSON Parsing      │  Parse objects, catch malformed JSON
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  4. Schema Validation│  Validate each channel against Pydantic model
│     (if enabled)     │  Check field types, ranges, enum values
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  5. Data Validation  │  Check frequencies are in requested range,
│     (if enabled)     │  modes match selection, naming rule compliance
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  6. Merge + Dedup     │  Apply merge policy + duplicate strategy
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  7. Rename Tool Pass  │  Optional naming normalisation pass
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  8. Error Correction │  If validation found issues, send invalid
│     (if strict)      │  items back to LLM for correction/removal
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  9. CSV Generation    │  Convert validated channels to CHIRP CSV
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 10. Directory Index  │  Save list record + per-channel records
└──────────┬──────────┘
           │
           ▼
  Finalised list + searchable frequency index ready
```

### Validation Levels

| Level | What It Does |
|---|---|
| **None** | Parse + export only. Minimal checks. Fastest. |
| **Standard** | Schema + data validation + merge/dedup rules + optional NFM assignment. Invalid entries logged with warnings. |
| **Strict** | Full validation + corrective LLM pass + naming constraints enforcement + directory consistency checks. |

---

## Error Recovery and Debugging

CHIRP generation error behavior is config-driven via `data/chirp-error-handling.json`.

Each rule can define:

- `match.contains` (message text matches)
- `match.status_codes` (HTTP status matches)
- `retryable` and `action_label` (primary retry button)
- `hint` (user guidance)
- `secondary_action` (optional advanced action)

### Model Rotation Action

When a rule includes:

```json
"secondary_action": {
  "type": "next_model",
  "label": "Try different model"
}
```

the UI shows a **Try different model** button. It switches to the next model in the current provider list and immediately retries generation.

### Optional Debug Panel

CHIRP includes a collapsible debug panel in the UI that can show:

- form settings used for the request (excluding API key)
- provider response metadata and content preview
- validation summary and invalid examples
- matched error rule and status context

This helps diagnose cases like unknown model IDs or over-strict validation without exposing secrets.

### Deduplication Rules

A channel is considered a duplicate if **both** of the following match an existing entry:
- `name` (case-insensitive)
- `frequency` (exact match)

When a duplicate is found, keep the first occurrence and discard subsequent ones.

When merging lists, support additional duplicate strategies:

- **same-frequency**: treat channels as duplicates when `frequency` matches and `mode` matches
- **same-service-key**: treat channels as duplicates when `frequency + location + mode` match
- **manual-review**: keep potential duplicates and mark with `needs_review: true`

Default merge behaviour: `same-frequency` + keep first, unless user selects another policy.

### Location-Aware Descriptions

The same frequency may have different operational descriptions by location (for example marine channels). The system must preserve location context instead of flattening to a single global description.

Guidelines:

- Keep channel technical identity (`frequency`, `mode`, tones) separate from usage metadata.
- Store location-specific labels/comments as variant records.
- During merge, never overwrite a location-specific description with another location's description unless explicitly chosen.

---

## CHIRP CSV Format

The generated CSV follows the CHIRP standard format:

```csv
Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,Mode,TStep,Skip,Comment,URCALL,RPT1CALL,RPT2CALL,DVCODE
0,CALL,145.5000, ,0.600000,, 88.5, 88.5,023,NN,FM,5.00,,Calling Freq,,,,
1,GB3AB,145.6250,-,0.600000,Tone, 77.0, 77.0,023,NN,FM,5.00,,Local Rpt,,,,
```

### CSV Column Reference

| Column | Description | Source |
|---|---|---|
| Location | Channel number (auto-incremented from 0) | Generated |
| Name | Channel name (rule-driven; default max 10 chars) | LLM `name` |
| Frequency | Receive frequency in MHz | LLM `frequency` |
| Duplex | Blank, `+`, `-`, or `split` | LLM `duplex` |
| Offset | Duplex offset in MHz | LLM `offset` |
| Tone | Tone mode: blank, `Tone`, `TSQL`, `DTCS` | LLM `tone_mode` |
| rToneFreq | Receive CTCSS tone (Hz) | LLM `r_tone_freq` |
| cToneFreq | Transmit CTCSS tone (Hz) | LLM `t_tone_freq` |
| DtcsCode | DCS code | LLM `dtcs_code` |
| DtcsPolarity | DCS polarity (default `NN`) | Default |
| Mode | FM, AM, NFM, DV, etc. | LLM `mode` |
| TStep | Tuning step (default `5.00`) | Default |
| Skip | Skip during scan (default blank) | Default |
| Comment | Description | LLM `comment` |
| URCALL, RPT1CALL, RPT2CALL, DVCODE | D-STAR fields (default blank) | Default |

> Export note: some target radios enforce shorter channel names than the workspace naming rule. During final CSV export, apply profile-specific validation/truncation and surface any truncation in the validation report.

---

## CSV & Frequency Directory

Finalised lists are saved to a public directory, and each channel is also indexed as a searchable frequency entry.

### List Directory Entry Schema (Firestore)

```json
{
  "id": "list_auto_id",
  "title": "Interesting VHF repeaters around London",
  "description": "User's original prompt text",
  "csv_storage_path": "csvs/abc123.csv",
  "metadata": {
    "num_channels": 25,
    "freq_min": 144.0,
    "freq_max": 148.0,
    "modes": ["FM"],
    "includes_repeaters": true,
    "bands": ["VHF"],
    "location": "London, UK",
    "llm_provider": "openai",
    "validation_level": "standard"
  },
  "status": "finalised",
  "created_at": "2026-03-29T12:00:00Z",
  "created_by": "user_uid",  // null for anonymous generations
  "download_count": 0,
  "tags": ["vhf", "repeaters", "london", "uk", "fm"]
}
```

### Frequency Directory Entry Schema (Firestore)

```json
{
  "id": "freq_auto_id",
  "list_id": "list_auto_id",
  "name": "THAMESPA",
  "frequency": 156.500,
  "mode": "FM",
  "duplex": "",
  "offset": 0,
  "tone_mode": "",
  "r_tone_freq": 88.5,
  "t_tone_freq": 88.5,
  "dtcs_code": 23,
  "comment": "Port authority traffic",
  "location_context": {
    "city": "London",
    "region": "England",
    "country": "GB",
    "free_text": "Thames estuary"
  },
  "service_tags": ["marine", "port-authority"],
  "created_at": "2026-03-29T12:00:00Z"
}
```

### Directory Filters

The directory supports two entity types: `lists` and `frequencies`.

List filters:

| Filter | Options |
|---|---|
| Mode | FM, AM, DMR, SSB, CW, Mixed |
| Band | HF, VHF, UHF, All |
| Repeaters | Included / Excluded / Any |
| Region | Text search / country dropdown |
| Sort by | Newest, Most Downloaded, Most Channels |

Frequency filters:

| Filter | Options |
|---|---|
| Frequency | Exact / range |
| Mode | FM, NFM, AM, DV, USB, LSB, CW |
| Location | Country / region / city / free text |
| Service Tag | Marine, PMR446, Airband, Repeater, etc |
| Parent List | Show frequencies from selected list |

Keyword search runs against:

- Lists: `title`, `description`, `tags`
- Frequencies: `name`, `comment`, `service_tags`, `location_context`

### Session vs Logged-In Behaviour

- **All users (including anonymous):** The most recently generated CSV and its metadata are held in `sessionStorage` for the duration of the browser session. This allows the download button and preview table to work without requiring login.
- **All users:** Every successful **finalise** action is automatically saved to public list + frequency indexes. `created_by` is `null` for anonymous users.
- **Logged-in users:** Finalised lists are linked in account history (`users/{uid}/saved_csvs/{listId}`) and editable drafts are stored privately. Removing from account history should not remove public directory records.
- **Favouriting:** Any logged-in user can favourite either a list or an individual frequency entry. Favourites remain private in `users/{uid}/favourites/*`.

### Saving to Directory

For every successful finalised list save:
1. The CSV is uploaded to Firebase Storage — see [LLM-FIREBASE.md](LLM-FIREBASE.md)
2. A list document is created in `csv_directory/{listId}`
3. A frequency document is created for each channel in `frequency_directory/{frequencyId}` with `list_id` back-reference
4. Tags are generated at both list and item level
5. List and item entries become searchable immediately
6. For logged-in users: a link record is written to `users/{uid}/saved_csvs/{listId}`

If the upload or Firestore write fails, the user is shown an error but can still download the CSV from the in-page preview (it remains in `sessionStorage`).

---

## Error Handling

| Error | User Sees | Recovery |
|---|---|---|
| Invalid API key | "API key rejected by {provider}. Check your key and try again." | Re-enter key |
| LLM rate limit | "Rate limit reached. Please wait and try again." | Wait + retry button |
| Malformed JSON response | "The AI response couldn't be parsed. Trying again..." | Auto-retry once, then show error |
| No valid channels after validation | "No valid channels were generated. Try adjusting your settings." | Modify options |
| Merge conflict in strict mode | "Some merged channels conflict and need review." | Open merge review panel |
| Rename rules produce collisions | "Renaming produced duplicate names. Adjust rules or allow suffixes." | Retry rename with options |
| Network error | "Connection error. Check your internet and try again." | Retry button |
| LLM returns non-JSON | Strip markdown fences, attempt extraction of JSON from response | Auto-recovery |

---

## Pydantic Models

```python
from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional
from enum import Enum

class DuplexType(str, Enum):
    NONE = ""
    PLUS = "+"
    MINUS = "-"
    SPLIT = "split"

class ToneMode(str, Enum):
    NONE = ""
    TONE = "Tone"
    TSQL = "TSQL"
    DTCS = "DTCS"

class RadioMode(str, Enum):
    FM = "FM"
    AM = "AM"
    NFM = "NFM"
    DV = "DV"
    USB = "USB"
    LSB = "LSB"
    CW = "CW"

class ChirpChannel(BaseModel):
    name: str = Field(max_length=10, description="Short descriptive name")
    frequency: float = Field(gt=0, description="Frequency in MHz")
    duplex: DuplexType = DuplexType.NONE
    offset: float = Field(default=0.0, ge=0, description="Duplex offset in MHz")
    tone_mode: ToneMode = ToneMode.NONE
    r_tone_freq: float = Field(default=88.5, description="Receive CTCSS tone Hz")
    t_tone_freq: float = Field(default=88.5, description="Transmit CTCSS tone Hz")
    dtcs_code: int = Field(default=23, ge=0, le=777, description="DCS code")
    mode: RadioMode = RadioMode.FM
    comment: str = Field(default="", max_length=200, description="Description")
    list_item_id: Optional[str] = None
    source_list_id: Optional[str] = None
    location_context: Optional[dict] = None
    needs_review: bool = False

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip().upper()

class ChirpResponse(BaseModel):
    channels: list[ChirpChannel]

class MergeOptions(BaseModel):
    strategy: Literal["keep_first", "keep_latest", "keep_both", "merge_metadata"] = "keep_first"
    duplicate_rule: Literal["name_frequency", "same_frequency", "same_service_key", "manual_review"] = "same_frequency"

class RenameRules(BaseModel):
    max_length: int = Field(default=10, ge=4, le=16)
    all_caps: bool = True
    style_prompt: str = "Descriptive station names"

class GenerationRequest(BaseModel):
    provider: Literal["openai", "gemini", "claude", "grok", "github"]
    api_key: str
    freq_min: float = 0.5
    freq_max: float = 1300.0
    modes: list[RadioMode] = [RadioMode.FM, RadioMode.AM]
    include_repeaters: bool = True
    bands: list[Literal["HF", "VHF", "UHF"]] = ["VHF", "UHF"]
    location: str
    num_channels: int = Field(default=25, ge=10, le=100)
    prompt: str = "Interesting radio frequencies local to {location}"
    validation_level: Literal["none", "standard", "strict"] = "standard"
    merge_options: Optional[MergeOptions] = None
    rename_rules: Optional[RenameRules] = None
    auto_assign_nfm: bool = True
```

---

## Security Considerations

- **API keys are transmitted over HTTPS** to the Cloudflare Worker and used ephemerally
- **Input sanitisation**: User prompts are checked for injection attempts before being embedded in the LLM prompt
- **Response size limits**: Responses larger than 500KB are rejected to prevent abuse
- **Rate limiting**: Max 10 generations per minute per IP — see [LLM-CLOUDFLARE.md](LLM-CLOUDFLARE.md)
- **CSV content sanitisation**: Generated CSV content is escaped to prevent formula injection (e.g., cells starting with `=`, `+`, `-`, `@` in name/comment fields are prefixed with a single quote)
- **Secret-safe logging**: Logs must contain only redacted metadata and request IDs; never include API keys, auth tokens, full prompts, or full CSV payloads
