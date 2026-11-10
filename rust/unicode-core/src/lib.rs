//! BabelCodec Unicode Core — Rust → WASM

use serde::{Deserialize, Serialize};
use unicode_ident::{is_xid_continue, is_xid_start};
use unicode_normalization::UnicodeNormalization;
use unicode_script::UnicodeScript;
use unicode_segmentation::UnicodeSegmentation;

pub const ENGINE_VERSION: &str = "0.10.0";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphemeInfo {
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub code_points: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizationResult {
    pub text: String,
    pub profile: String,
    pub changed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodePointInfo {
    pub text: String,
    pub code_point: u32,
    pub u_plus: String,
    pub utf16_start: usize,
    pub utf16_end: usize,
    pub is_xid_start: bool,
    pub is_xid_continue: bool,
    pub script: String,
    pub is_combining: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptSummary {
    pub primary: String,
    pub scripts: std::collections::BTreeMap<String, usize>,
    pub mixed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Utf16Units {
    pub schema: String,
    pub units: Vec<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceIdentity {
    pub text: String,
    pub codepoints: Vec<String>,
    pub utf16_units: Option<Utf16Units>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisView {
    pub text: String,
    pub codepoints: Vec<String>,
    pub scalars: Vec<CodePointInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanonicalInspection {
    pub schema: String,
    pub engine_version: String,
    pub source: SourceIdentity,
    pub analysis: AnalysisView,
    pub graphemes: Vec<GraphemeInfo>,
    pub grapheme_method: String,
    pub script: ScriptSummary,
    pub normalization: NormalizationResult,
    pub diagnostics: Vec<Diagnostic>,
}

fn units_to_string(units: &[u16]) -> Result<String, String> {
    let mut out = String::new();
    let mut i = 0;
    while i < units.len() {
        let u = units[i];
        if (0xD800..=0xDBFF).contains(&u) {
            if i + 1 >= units.len() {
                return Err(format!("unpaired surrogate at {}", i));
            }
            let lo = units[i + 1];
            if !(0xDC00..=0xDFFF).contains(&lo) {
                return Err(format!("unpaired surrogate at {}", i));
            }
            let cp = 0x10000 + (((u as u32 - 0xD800) << 10) | (lo as u32 - 0xDC00));
            out.push(char::from_u32(cp).unwrap());
            i += 2;
        } else if (0xDC00..=0xDFFF).contains(&u) {
            return Err(format!("unpaired surrogate at {}", i));
        } else {
            out.push(char::from_u32(u as u32).unwrap());
            i += 1;
        }
    }
    Ok(out)
}

pub fn segment_graphemes(text: &str) -> Vec<GraphemeInfo> {
    let mut out = Vec::new();
    let mut idx = 0usize;
    for g in text.graphemes(true) {
        let cps: Vec<u32> = g.chars().map(|c| c as u32).collect();
        let n = g.encode_utf16().count();
        out.push(GraphemeInfo {
            text: g.to_string(),
            start: idx,
            end: idx + n,
            code_points: cps,
        });
        idx += n;
    }
    out
}

pub fn apply_normalization(text: &str, profile: &str) -> NormalizationResult {
    let normalized = match profile {
        "NFC" => text.nfc().collect::<String>(),
        "NFD" => text.nfd().collect::<String>(),
        "NFKC" => text.nfkc().collect::<String>(),
        "NFKD" => text.nfkd().collect::<String>(),
        _ => text.to_string(),
    };
    let profile_used = if matches!(profile, "NFC" | "NFD" | "NFKC" | "NFKD") {
        profile
    } else {
        "NONE"
    };
    NormalizationResult {
        changed: normalized != text,
        text: normalized,
        profile: profile_used.to_string(),
    }
}

pub fn iterate_code_points(text: &str) -> Vec<CodePointInfo> {
    let mut out = Vec::new();
    let mut utf16_idx = 0usize;
    for ch in text.chars() {
        let cp = ch as u32;
        let utf16_len = if cp > 0xFFFF { 2 } else { 1 };
        out.push(CodePointInfo {
            text: ch.to_string(),
            code_point: cp,
            u_plus: format!("U+{:04X}", cp),
            utf16_start: utf16_idx,
            utf16_end: utf16_idx + utf16_len,
            is_xid_start: is_xid_start(ch),
            is_xid_continue: is_xid_continue(ch),
            script: format!("{:?}", ch.script()),
            is_combining: {
                let c = cp;
                (0x0300..=0x036F).contains(&c)
            },
        });
        utf16_idx += utf16_len;
    }
    out
}

pub fn detect_scripts(text: &str) -> ScriptSummary {
    let mut counts: std::collections::BTreeMap<String, usize> =
        std::collections::BTreeMap::new();
    for ch in text.chars() {
        let name = format!("{:?}", ch.script());
        *counts.entry(name).or_insert(0) += 1;
    }
    let mut primary = "Unknown".to_string();
    let mut max = 0usize;
    for (name, n) in &counts {
        if name == "Common" || name == "Inherited" || name == "Unknown" {
            continue;
        }
        if *n > max {
            max = *n;
            primary = name.clone();
        }
    }
    let mixed = counts
        .keys()
        .filter(|k| *k != "Common" && *k != "Inherited" && *k != "Unknown")
        .count()
        > 1;
    ScriptSummary {
        primary,
        scripts: counts,
        mixed,
    }
}

pub fn is_xid_identifier(text: &str) -> bool {
    let mut chars = text.chars();
    match chars.next() {
        Some(c) if is_xid_start(c) => chars.all(is_xid_continue),
        _ => false,
    }
}

pub fn inspect_canonical(text: &str, normalization_profile: &str) -> CanonicalInspection {
    let norm = apply_normalization(text, normalization_profile);
    let analysis_text = if norm.profile == "NONE" {
        text.to_string()
    } else {
        norm.text.clone()
    };
    let mut diagnostics = Vec::new();
    if norm.changed {
        diagnostics.push(Diagnostic {
            code: "NORMALIZATION_APPLIED".to_string(),
            message: format!("Applied {}", norm.profile),
            detail: Some(norm.profile.clone()),
        });
    }
    let scalars = iterate_code_points(&analysis_text);
    let codepoints: Vec<String> = scalars.iter().map(|c| c.u_plus.clone()).collect();
    let source_cps: Vec<String> = iterate_code_points(text)
        .into_iter()
        .map(|c| c.u_plus)
        .collect();
    let graphemes = segment_graphemes(&analysis_text);
    let script = detect_scripts(&analysis_text);
    let units: Vec<u16> = text.encode_utf16().collect();
    CanonicalInspection {
        schema: "babelcodec.canonical.v1".to_string(),
        engine_version: ENGINE_VERSION.to_string(),
        source: SourceIdentity {
            text: text.to_string(),
            codepoints: source_cps,
            utf16_units: Some(Utf16Units {
                schema: "babelcodec.utf16.v1".to_string(),
                units,
            }),
        },
        analysis: AnalysisView {
            text: analysis_text,
            codepoints,
            scalars,
        },
        graphemes,
        grapheme_method: "unicode-segmentation (UAX #29)".to_string(),
        script,
        normalization: norm,
        diagnostics,
    }
}

#[cfg(target_arch = "wasm32")]
mod wasm_api {
    use super::*;
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    pub fn engine_version() -> String {
        ENGINE_VERSION.to_string()
    }

    #[wasm_bindgen(js_name = initializeUnicodeCore)]
    pub fn initialize_unicode_core() -> bool {
        true
    }

    #[wasm_bindgen(js_name = inspectFromUtf16)]
    pub fn inspect_from_utf16(
        units: &[u16],
        normalization_profile: &str,
    ) -> Result<JsValue, JsValue> {
        match units_to_string(units) {
            Ok(s) => {
                let insp = inspect_canonical(&s, normalization_profile);
                serde_wasm_bindgen::to_value(&insp).map_err(|e| JsValue::from_str(&e.to_string()))
            }
            Err(e) => Err(JsValue::from_str(&e)),
        }
    }

    #[wasm_bindgen(js_name = normalizeFromUtf16)]
    pub fn normalize_from_utf16(units: &[u16], profile: &str) -> Result<JsValue, JsValue> {
        let s = units_to_string(units).map_err(|e| JsValue::from_str(&e))?;
        let res = apply_normalization(&s, profile);
        serde_wasm_bindgen::to_value(&res).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = segmentGraphemesFromUtf16)]
    pub fn segment_graphemes_from_utf16(units: &[u16]) -> Result<JsValue, JsValue> {
        let s = units_to_string(units).map_err(|e| JsValue::from_str(&e))?;
        let g = segment_graphemes(&s);
        serde_wasm_bindgen::to_value(&g).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = detectScriptsFromUtf16)]
    pub fn detect_scripts_from_utf16(units: &[u16]) -> Result<JsValue, JsValue> {
        let s = units_to_string(units).map_err(|e| JsValue::from_str(&e))?;
        let sc = detect_scripts(&s);
        serde_wasm_bindgen::to_value(&sc).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = isXidIdentifierFromUtf16)]
    pub fn is_xid_identifier_from_utf16(units: &[u16]) -> Result<bool, JsValue> {
        let s = units_to_string(units).map_err(|e| JsValue::from_str(&e))?;
        Ok(is_xid_identifier(&s))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoke() {
        assert_eq!(segment_graphemes("ab").len(), 2);
        assert!(apply_normalization("e\u{0301}", "NFC").changed);
        assert!(is_xid_identifier("foo"));
        let insp = inspect_canonical("e\u{0301}", "NFC");
        assert_eq!(insp.source.text, "e\u{0301}");
    }
}
