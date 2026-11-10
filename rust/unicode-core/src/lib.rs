//! BabelCodec Unicode Core — canonical Rust Unicode engine.

#![deny(unsafe_code)]

use serde::{Deserialize, Serialize};
use unicode_ident::{is_xid_continue, is_xid_start};
use unicode_normalization::UnicodeNormalization;
use unicode_script::UnicodeScript;
use unicode_segmentation::UnicodeSegmentation;

pub const ENGINE_VERSION: &str = "0.10.0";

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
pub struct GraphemeInfo {
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub code_points: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NormalizationResult {
    pub text: String,
    pub profile: String,
    pub changed: bool,
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

pub fn primary_script(text: &str) -> String {
    use std::collections::HashMap;
    let mut counts: HashMap<String, usize> = HashMap::new();
    for ch in text.chars() {
        let name = format!("{:?}", ch.script());
        *counts.entry(name).or_insert(0) += 1;
    }
    counts
        .into_iter()
        .filter(|(k, _)| k != "Common" && k != "Inherited" && k != "Unknown")
        .max_by_key(|(_, n)| *n)
        .map(|(k, _)| k)
        .unwrap_or_else(|| "Unknown".to_string())
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

    #[wasm_bindgen(js_name = segmentGraphemesFromUtf16)]
    pub fn segment_graphemes_from_utf16(units: &[u16]) -> Result<JsValue, JsValue> {
        let utf16 = Utf16Units::new(units.to_vec());
        let s = utf16.try_to_string().map_err(|e| JsValue::from_str(&e))?;
        let g = segment_graphemes(&s);
        serde_wasm_bindgen::to_value(&g).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = normalizeFromUtf16)]
    pub fn normalize_from_utf16(units: &[u16], profile: &str) -> Result<JsValue, JsValue> {
        let utf16 = Utf16Units::new(units.to_vec());
        let s = utf16.try_to_string().map_err(|e| JsValue::from_str(&e))?;
        let res = apply_normalization(&s, profile);
        serde_wasm_bindgen::to_value(&res).map_err(|e| JsValue::from_str(&e.to_string()))
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
    fn script_latin() {
        let p = primary_script("Hello");
        assert!(!p.is_empty());
    }
}
