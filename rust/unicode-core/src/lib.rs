//! BabelCodec Unicode Core — canonical Rust Unicode engine.

#![deny(unsafe_code)]

use serde::{Deserialize, Serialize};
use unicode_ident::{is_xid_continue, is_xid_start};
use unicode_normalization::UnicodeNormalization;
use unicode_script::UnicodeScript;
use unicode_segmentation::UnicodeSegmentation;

pub const ENGINE_VERSION: &str = "0.10.0";

pub const UNICODE_DATA_NOTES: &str =
    "unicode-ident 1.x, unicode-normalization 0.1, unicode-segmentation 1.11, unicode-script 0.5";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Utf16Units {
    pub schema: String,
    pub units: Vec<u16>,
}

impl Utf16Units {
    pub const SCHEMA: &'static str = "babelcodec.utf16.v1";

    pub fn new(units: Vec<u16>) -> Self {
        Self {
            schema: Self::SCHEMA.to_string(),
            units,
        }
    }

    pub fn from_str(s: &str) -> Self {
        Self::new(s.encode_utf16().collect())
    }

    pub fn try_to_string(&self) -> Result<String, String> {
        if self.schema != Self::SCHEMA {
            return Err(format!("unsupported schema: {}", self.schema));
        }
        let mut out = String::new();
        let mut i = 0;
        while i < self.units.len() {
            let u = self.units[i];
            if (0xD800..=0xDBFF).contains(&u) {
                if i + 1 >= self.units.len() {
                    return Err(format!("unpaired high surrogate at {}", i));
                }
                let lo = self.units[i + 1];
                if !(0xDC00..=0xDFFF).contains(&lo) {
                    return Err(format!("unpaired high surrogate at {}", i));
                }
                let cp = 0x10000 + (((u as u32 - 0xD800) << 10) | (lo as u32 - 0xDC00));
                out.push(char::from_u32(cp).unwrap());
                i += 2;
            } else if (0xDC00..=0xDFFF).contains(&u) {
                return Err(format!("unpaired low surrogate at {}", i));
            } else {
                out.push(char::from_u32(u as u32).unwrap());
                i += 1;
            }
        }
        Ok(out)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GraphemeInfo {
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub code_points: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScriptSummary {
    pub primary: String,
    pub scripts: std::collections::BTreeMap<String, usize>,
    pub mixed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NormalizationResult {
    pub text: String,
    pub profile: String,
    pub changed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Diagnostic {
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SourceIdentity {
    pub text: String,
    pub codepoints: Vec<String>,
    pub utf16_units: Option<Utf16Units>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AnalysisView {
    pub text: String,
    pub codepoints: Vec<String>,
    pub scalars: Vec<CodePointInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

fn u_plus(cp: u32) -> String {
    format!("U+{:04X}", cp)
}

fn is_combining_mark(cp: char) -> bool {
    let c = cp as u32;
    (0x0300..=0x036F).contains(&c)
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
            u_plus: u_plus(cp),
            utf16_start: utf16_idx,
            utf16_end: utf16_idx + utf16_len,
            is_xid_start: is_xid_start(ch),
            is_xid_continue: is_xid_continue(ch),
            script: format!("{:?}", ch.script()),
            is_combining: is_combining_mark(ch),
        });
        utf16_idx += utf16_len;
    }
    out
}

pub fn segment_graphemes(text: &str) -> Vec<GraphemeInfo> {
    let mut out = Vec::new();
    let mut utf16_idx = 0usize;
    for g in text.graphemes(true) {
        let cps: Vec<u32> = g.chars().map(|c| c as u32).collect();
        let utf16_len = g.encode_utf16().count();
        out.push(GraphemeInfo {
            text: g.to_string(),
            start: utf16_idx,
            end: utf16_idx + utf16_len,
            code_points: cps,
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
    if max == 0 {
        primary = counts
            .keys()
            .next()
            .cloned()
            .unwrap_or_else(|| "Unknown".to_string());
    }
    let distinct: Vec<_> = counts
        .keys()
        .filter(|k| *k != "Common" && *k != "Inherited" && *k != "Unknown")
        .collect();
    ScriptSummary {
        primary,
        scripts: counts,
        mixed: distinct.len() > 1,
    }
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

pub fn is_xid_identifier(text: &str) -> bool {
    let mut chars = text.chars();
    match chars.next() {
        Some(c) if is_xid_start(c) => chars.all(is_xid_continue),
        _ => false,
    }
}

pub fn inspect_canonical(text: &str, normalization_profile: &str) -> CanonicalInspection {
    let mut diagnostics = Vec::new();
    let norm = apply_normalization(text, normalization_profile);
    let analysis_text = if norm.profile == "NONE" {
        text
    } else {
        norm.text.as_str()
    };
    if norm.changed {
        diagnostics.push(Diagnostic {
            code: "NORMALIZATION_APPLIED".to_string(),
            message: format!("Applied {}", norm.profile),
            detail: Some(norm.profile.clone()),
        });
    }
    let scalars = iterate_code_points(analysis_text);
    let graphemes = segment_graphemes(analysis_text);
    let script = detect_scripts(analysis_text);
    CanonicalInspection {
        schema: "babelcodec.canonical.v1".to_string(),
        engine_version: ENGINE_VERSION.to_string(),
        source: SourceIdentity {
            text: text.to_string(),
            codepoints: iterate_code_points(text)
                .into_iter()
                .map(|c| c.u_plus)
                .collect(),
            utf16_units: Some(Utf16Units::from_str(text)),
        },
        analysis: AnalysisView {
            text: analysis_text.to_string(),
            codepoints: scalars.iter().map(|c| c.u_plus.clone()).collect(),
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

    #[wasm_bindgen]
    pub fn unicode_data_notes() -> String {
        UNICODE_DATA_NOTES.to_string()
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
        let utf16 = Utf16Units::new(units.to_vec());
        match utf16.try_to_string() {
            Ok(s) => {
                let insp = inspect_canonical(&s, normalization_profile);
                serde_wasm_bindgen::to_value(&insp).map_err(|e| JsValue::from_str(&e.to_string()))
            }
            Err(e) => {
                let diag = CanonicalInspection {
                    schema: "babelcodec.canonical.v1".to_string(),
                    engine_version: ENGINE_VERSION.to_string(),
                    source: SourceIdentity {
                        text: String::new(),
                        codepoints: vec![],
                        utf16_units: Some(utf16.clone()),
                    },
                    analysis: AnalysisView {
                        text: String::new(),
                        codepoints: vec![],
                        scalars: vec![],
                    },
                    graphemes: vec![],
                    grapheme_method: "unavailable".to_string(),
                    script: ScriptSummary {
                        primary: "Unknown".to_string(),
                        scripts: std::collections::BTreeMap::new(),
                        mixed: false,
                    },
                    normalization: NormalizationResult {
                        text: String::new(),
                        profile: "NONE".to_string(),
                        changed: false,
                    },
                    diagnostics: vec![Diagnostic {
                        code: "INVALID_UTF16".to_string(),
                        message: e,
                        detail: Some(
                            "unpaired surrogate preserved in source.utf16_units".to_string(),
                        ),
                    }],
                };
                serde_wasm_bindgen::to_value(&diag).map_err(|e| JsValue::from_str(&e.to_string()))
            }
        }
    }

    #[wasm_bindgen(js_name = normalizeFromUtf16)]
    pub fn normalize_from_utf16(units: &[u16], profile: &str) -> Result<JsValue, JsValue> {
        let utf16 = Utf16Units::new(units.to_vec());
        let s = utf16.try_to_string().map_err(|e| JsValue::from_str(&e))?;
        let res = apply_normalization(&s, profile);
        serde_wasm_bindgen::to_value(&res).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = segmentGraphemesFromUtf16)]
    pub fn segment_graphemes_from_utf16(units: &[u16]) -> Result<JsValue, JsValue> {
        let utf16 = Utf16Units::new(units.to_vec());
        let s = utf16.try_to_string().map_err(|e| JsValue::from_str(&e))?;
        let g = segment_graphemes(&s);
        serde_wasm_bindgen::to_value(&g).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = detectScriptsFromUtf16)]
    pub fn detect_scripts_from_utf16(units: &[u16]) -> Result<JsValue, JsValue> {
        let utf16 = Utf16Units::new(units.to_vec());
        let s = utf16.try_to_string().map_err(|e| JsValue::from_str(&e))?;
        let sc = detect_scripts(&s);
        serde_wasm_bindgen::to_value(&sc).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = isXidIdentifierFromUtf16)]
    pub fn is_xid_identifier_from_utf16(units: &[u16]) -> Result<bool, JsValue> {
        let utf16 = Utf16Units::new(units.to_vec());
        let s = utf16.try_to_string().map_err(|e| JsValue::from_str(&e))?;
        Ok(is_xid_identifier(&s))
    }

    #[wasm_bindgen(js_name = encodeUtf16Units)]
    pub fn encode_utf16_units(s: &str) -> Result<JsValue, JsValue> {
        let u = Utf16Units::from_str(s);
        serde_wasm_bindgen::to_value(&u).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graphemes_ascii() {
        assert_eq!(segment_graphemes("ab").len(), 2);
    }

    #[test]
    fn graphemes_combining() {
        assert_eq!(segment_graphemes("e\u{0301}").len(), 1);
    }

    #[test]
    fn nfc() {
        let r = apply_normalization("e\u{0301}", "NFC");
        assert!(r.changed);
        assert_eq!(r.text.chars().count(), 1);
    }

    #[test]
    fn xid() {
        assert!(is_xid_identifier("foo"));
        assert!(!is_xid_identifier("1x"));
    }

    #[test]
    fn utf16_roundtrip() {
        let s = "A\u{1D11E}B";
        let u = Utf16Units::from_str(s);
        assert_eq!(u.try_to_string().unwrap(), s);
    }

    #[test]
    fn unpaired_surrogate() {
        assert!(Utf16Units::new(vec![0xD800]).try_to_string().is_err());
    }

    #[test]
    fn inspect_source() {
        let s = "e\u{0301}";
        let insp = inspect_canonical(s, "NFC");
        assert_eq!(insp.source.text, s);
        assert!(insp.normalization.changed);
    }
}
