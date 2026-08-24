# Install the Skill

Copy the `fm-shopee-competitor-monitor` folder into the Codex skills directory:

```text
%CODEX_HOME%\skills\fm-shopee-competitor-monitor
```

If `CODEX_HOME` is not set, use:

```text
%USERPROFILE%\.codex\skills\fm-shopee-competitor-monitor
```

On macOS or Linux, use `~/.codex/skills/fm-shopee-competitor-monitor` unless `CODEX_HOME` is configured.

Restart or refresh Codex, then invoke it explicitly with:

```text
$fm-shopee-competitor-monitor
```

The skill can also be discovered automatically for requests involving fixed Shopee competitor links, SKU price tracking, the FM Chrome extension, or per-user cloud synchronization.

For repository-based installation, copy only this skill directory from:

```text
skills/fm-shopee-competitor-monitor
```

Do not copy real Google credentials, BigQuery keys, service-account JSON files, or personal sync tokens into the skill directory.

For a step-by-step business-user onboarding and daily operating procedure, read:

```text
references/new-user-sop.md
```

The Skill package also contains the FM extension source at:

```text
assets/chrome-extension
```

To prepare the extension in a stable local folder and open Chrome's extension manager, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-chrome-extension.ps1
```

Chrome still requires a one-time user-visible “Load unpacked” confirmation. After it is loaded, the extension runs in the current Chrome profile and can use the Shopee login state already present in that profile. The Skill must not read, export, or store passwords and cookies.
