#!/usr/bin/env python3
"""Build the bilingual (English + Turkish) plain-language explainer of LIBRAIN's Discovery results.

Reads committed result files only (no network, no LLM calls), writes explainer.html next to this
script and prints it to docs/LIBRAIN-discoveries-explained.pdf with headless Chrome.

Layout: every section is written twice, side by side (English left, Turkish right); charts,
tables and the AI's quoted claims are shared.

Batches
  1. experiments/featured-discoveries/    (required)
  2. experiments/new-areas-discoveries/   (included automatically when it exists; otherwise the
                                           booklet shows a short "coming in the final version" note)

Every number in the text is computed here from the run files. Hand-written per-discovery copy
(plain titles, summaries, test ideas, paper labels, Turkish area names) lives in
featured_copy.json, so a new batch only needs new entries there. A featured run without copy
falls back to the manifest's English takeaway.

Usage
  python3 -I docs/explainer/build_explainer.py              # HTML + PDF
  python3 -I docs/explainer/build_explainer.py --html-only  # HTML only
  python3 -I docs/explainer/build_explainer.py --no-batch2  # preview the version-1 layout
"""
import argparse
import base64
import csv
import datetime
import glob
import html
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
EXP = os.path.join(REPO, "experiments")
OUT_HTML = os.path.join(HERE, "explainer.html")
OUT_PDF = os.path.join(REPO, "docs", "LIBRAIN-discoveries-explained.pdf")
COPY_FILE = os.path.join(HERE, "featured_copy.json")
SCREENSHOT = os.path.join(REPO, "web", "docs", "screenshots", "discover.png")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

BATCH1 = "featured-discoveries"
BATCH2 = "new-areas-discoveries"

# Context figures that are not stored in the run files.
SECONDS_PER_RUN = 25       # owner-measured wall-clock time per Discovery run (runs store no timing)
PLANNED_BATCH2_RUNS = 25   # plan for batch 2, shown only while its folder does not exist
RQ3_AMBIGUOUS = 2          # CHANGELOG: 2 of the 67 counted Naive-RAG fabrications are ambiguous -> "65–67"
AUTHOR = "Eren Mutlu"

GROUNDED, EXTRAPOLATED, RISKY = 0, 1, 2
LANGS = ("en", "tr")

MONTHS = {
    "en": ["January", "February", "March", "April", "May", "June", "July", "August",
           "September", "October", "November", "December"],
    "tr": ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos",
           "Eylül", "Ekim", "Kasım", "Aralık"],
}

# Series colours for the batch comparison chart (validated categorical slots 1-2 + neutral ink).
SERIES = {"b1": "#2a78d6", "b2": "#eb6834", "all": "#1d2433"}


# --------------------------------------------------------------------------------------------
# Formatting
# --------------------------------------------------------------------------------------------

def esc(s):
    return html.escape(str(s), quote=True)


def num(x, lang, d=2):
    s = f"{x:.{d}f}"
    return s.replace(".", ",") if lang == "tr" else s


def integer(n, lang):
    s = f"{n:,}"
    return s.replace(",", ".") if lang == "tr" else s


def pct_value(p, lang, d=0):
    s = num(p, lang, d)
    return f"%{s}" if lang == "tr" else f"{s}%"


def pct(k, n, lang):
    return pct_value(100.0 * k / n if n else 0.0, lang)


def usd(x, lang, d=2):
    s = num(x, lang, d)
    return f"{s} $" if lang == "tr" else f"${s}"


def date_str(d, lang):
    return f"{d.day} {MONTHS[lang][d.month - 1]} {d.year}"


def plural(n, one, many):
    return one if n == 1 else many


# --------------------------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------------------------

def read_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def load_batch(name):
    folder = os.path.join(EXP, name)
    runs_dir = os.path.join(folder, "runs")
    if not os.path.isdir(runs_dir):
        return None
    runs = [read_json(p) for p in sorted(glob.glob(os.path.join(runs_dir, "*.json")))]
    if not runs:
        return None
    manifest_path = os.path.join(folder, "featured.json")
    manifest = read_json(manifest_path) if os.path.isfile(manifest_path) else {}
    return {"name": name, "runs": runs, "manifest": manifest, "by_id": {r["id"]: r for r in runs}}


def merge_batches(batches):
    runs = [r for b in batches for r in b["runs"]]
    manifest = {"featured": [f for b in batches for f in b["manifest"].get("featured", [])],
                "corpus": batches[-1]["manifest"].get("corpus", ""),
                "date": batches[-1]["manifest"].get("date")}
    return {"name": "all", "runs": runs, "manifest": manifest, "by_id": {r["id"]: r for r in runs}}


def is_valid(run):
    r = run.get("response")
    return bool(run.get("status") == 200 and isinstance(r, dict) and r.get("hypothesis")
                and isinstance(r.get("evaluation"), dict))


def claims_of(run):
    cv = (run.get("response") or {}).get("claimValidation") or {}
    return cv.get("claims") or []


def corpus_count(manifest, word):
    m = re.search(r"(\d[\d,]*)\s+" + word, manifest.get("corpus", ""))
    return int(m.group(1).replace(",", "")) if m else None


def area_of(b, run_id):
    for a in b["manifest"].get("areas", []):
        if run_id.startswith(a.get("prefix", "\0")):
            return a.get("name")
    return None


def batch_stats(b):
    runs = b["runs"]
    n = len(runs)
    valid = [r for r in runs if is_valid(r)]
    resp = [r["response"] for r in valid]
    claimed = sum(x.get("claimedEvidenceCount", len(x.get("supportingEvidence") or [])) for x in resp)
    dropped = sum(x.get("droppedEvidenceCount", 0) for x in resp)
    kept = sum(len(x.get("supportingEvidence") or []) for x in resp)
    # A citation in the final output counts as fabricated if it does not carry a real retrieved passage.
    fabricated_final = sum(1 for x in resp for e in (x.get("supportingEvidence") or [])
                           if not (e.get("paperId") and e.get("content") and e.get("chunkIndex") is not None))
    checked = [r for r in valid if r["response"].get("claimValidation")
               and not r["response"]["claimValidation"].get("validationFailed")]
    no_risky = [r for r in checked if all(c.get("status") != RISKY for c in claims_of(r))]
    sentences = [c for r in checked for c in claims_of(r)]
    counts = {s: sum(1 for c in sentences if c.get("status") == s) for s in (GROUNDED, EXTRAPOLATED, RISKY)}

    def series(key):
        return [r["response"]["evaluation"][key] for r in valid]

    for r in valid:  # the quality score is the plain average of the three axes
        e = r["response"]["evaluation"]
        avg3 = (e["noveltyScore"] + e["plausibilityScore"] + e["structuralCoherenceScore"]) / 3
        assert abs(avg3 - e["qualityScore"]) < 1e-3, r["id"]
    plaus = series("plausibilityScore")
    scores = {
        "quality": series("qualityScore"),
        "novelty": series("noveltyScore"),
        "plausibility": plaus,
        "coherence": series("structuralCoherenceScore"),
        "risk": [r["response"]["claimValidation"]["aggregateRisk"] for r in checked],
    }
    costs = [r.get("costUsd", 0.0) for r in runs]
    featured = [f["id"] for f in b["manifest"].get("featured", []) if f.get("id") in b["by_id"]]
    top = max(valid, key=lambda r: r["response"]["evaluation"]["qualityScore"])
    topk = sorted({r["request"].get("topK") for r in runs if r.get("request", {}).get("topK")})
    return {
        "n": n, "valid": len(valid), "claimed": claimed, "dropped": dropped, "kept": kept,
        "fabricated_final": fabricated_final, "checked": len(checked), "no_risky": len(no_risky),
        "plaus_ok": sum(1 for p in plaus if p >= 0.6), "plaus_distinct": len(set(plaus)),
        "sentences": len(sentences), "counts": counts,
        "summary": {k: (statistics.mean(v), min(v), max(v)) for k, v in scores.items() if v},
        "cost_total": sum(costs), "cost_mean": statistics.mean(costs) if costs else 0.0,
        "cost_min": min(costs) if costs else 0.0, "cost_max": max(costs) if costs else 0.0,
        "featured": featured, "top_id": top["id"], "top_featured": top["id"] in featured,
        "papers": corpus_count(b["manifest"], "papers"), "chunks": corpus_count(b["manifest"], "chunks"),
        "new_papers": len(b["manifest"].get("newPapers", [])),
        "topk": topk[0] if len(topk) == 1 else None, "date": b["manifest"].get("date"),
    }


def load_context():
    """Earlier, committed paper results used as context."""
    ctx = {}
    with open(os.path.join(EXP, "hallucination-pilot", "combined-n30-per-system.csv"), encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["metric"] == "hallucination_flags":
                ctx["flags_" + row["system"]] = row["combined_n30"]
    naive = librain = 0
    with open(os.path.join(EXP, "fabrication-delta", "results.csv"), encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["system"] == "naive-rag":
                naive += int(row["fabricated"])
            elif row["system"] == "librain":
                librain += int(row["fabricated"])
    ctx["rq3_naive"] = f"{naive - RQ3_AMBIGUOUS}–{naive}"
    ctx["rq3_librain"] = librain
    with open(os.path.join(EXP, "novelty-validation", "summary.md"), encoding="utf-8") as fh:
        m = re.search(r"\*\*pooled\*\*\s*\|[^|]*\|[^|]*\|\s*([0-9]+[.,][0-9]+)", fh.read())
    ctx["novelty_rho"] = float(m.group(1).replace(",", "."))
    return ctx


# --------------------------------------------------------------------------------------------
# Static bilingual copy
# --------------------------------------------------------------------------------------------

T = {
    "en": {
        "toc_what": "What LIBRAIN is",
        "toc_how": "How one discovery is made",
        "toc_terms": "The words explained",
        "toc_results": "Results and success rates",
        "toc_featured": "Featured discoveries",
        "toc_batch2": "The second batch: new areas",
        "toc_assess": "An honest assessment",
        "toc_appendix": "Appendix: all runs",
        "what_lead": "Imagine a tireless research assistant with a highlighter.",
        "what": [
            "LIBRAIN is research software that reads scientific papers and suggests new ideas that connect them.",
            "Think of a tireless research assistant who has read every paper in a small library, on subjects from weather forecasting to football.",
            "You give it two topics, and it proposes a new connection between them that none of the papers states outright.",
            "Then, like a careful reader with a highlighter, it marks which parts of its own idea are backed by the papers and which parts are educated guesses.",
            "Its ideas are starting points for scientists, not finished discoveries: each one still has to be tested in the real world.",
        ],
        "how_lead": "Each idea comes out of the same four steps. One run takes about {secs} seconds and costs about {cost}.",
        "steps": [
            ("Pick two topics",
             "A person chooses two research topics, for example “crop yield prediction” and “CLIP” (an AI that links pictures and words)."),
            ("Find passages",
             "LIBRAIN searches the library by meaning and pulls out the {topk} passages closest to each topic."),
            ("Propose an idea",
             "Claude Sonnet 4.6 reads only those passages and writes a hypothesis. The part that goes beyond the papers is called the <b>novel claim</b>. Every reference must point to one of the passages."),
            ("Check and score",
             "Claude Haiku 4.5 checks each sentence of the novel claim against the passages and gives it a traffic-light label. The idea is also scored for novelty, plausibility and structure."),
        ],
        "shot_caption": ("<b>What it looks like.</b> The Discover screen of the LIBRAIN web app. Each sentence of the novel claim "
                         "is highlighted by its verdict (here one yellow, one red) and the side panel explains why. "
                         "This is an earlier example run, not one of the runs in this booklet."),
        "terms_lead": "A few words come up again and again. All scores run from 0 to 1. The everyday examples are only there to give a feel for each idea.",
        "scale": "Scale", "example": "Example", "watch": "Watch out",
        "results_lead": "In the first batch LIBRAIN ran {n} times, each time on a different pair of topics. This is how the results did on each check.",
        "caveat": ("<b>Read this first.</b> These are success rates for <b>passing LIBRAIN's own checks</b>. "
                   "They are <b>not</b> proof that any idea is true. Every idea here is a candidate that would need a real experiment."),
        "lights_expl": ("Most sentences are yellow, and that is expected: the novel claim is, by design, the part that goes beyond the papers, "
                        "so it should be worded as a careful guess. {g} {g_s} fully backed by the papers (green) and {r} {r_s} flagged red."),
        "featured_lead": ("After reading all {n} results, {k} were picked out: each names a specific mechanism, could be tested, "
                          "and bridges different papers. “Suggests” means exactly that: none of these ideas has been tested."),
        "b2_featured_lead": ("{k} of the {n} ideas were picked out, at least one per area, by the same rule: a specific mechanism, "
                             "a way to test it, and a bridge between papers. None has been tested."),
        "f_suggests": "What it suggests", "f_test": "How could someone test this?", "f_papers": "Papers it bridges",
        "f_red": "Why the red sentence matters", "f_green": "Why this sentence is green",
        "assess_lead": "The owner asked for an objective view: what works, what doesn't, what to fix, and whether to keep going.",
        "strengths": "Strengths", "limits": "Limits", "improve": "What to improve, in priority order",
        "verdict": "Is it worth continuing?", "milestone": "Suggested next milestone",
        "labels": {GROUNDED: "GROUNDED", EXTRAPOLATED: "EXTRAPOLATED", RISKY: "RISKY"},
        "score_names": {"novelty": "Novelty", "plausibility": "Plausibility", "coherence": "Structural coherence",
                        "quality": "Quality", "risk": "Claim risk"},
    },
    "tr": {
        "toc_what": "LIBRAIN nedir?",
        "toc_how": "Bir keşif nasıl yapılır?",
        "toc_terms": "Terimler, sade dille",
        "toc_results": "Sonuçlar ve başarı oranları",
        "toc_featured": "Öne çıkan keşifler",
        "toc_batch2": "İkinci grup: yeni alanlar",
        "toc_assess": "Dürüst bir değerlendirme",
        "toc_appendix": "Ek: tüm çalıştırmalar",
        "what_lead": "Elinde fosforlu kalemle hiç yorulmadan çalışan bir araştırma asistanı düşünün.",
        "what": [
            "LIBRAIN, bilimsel makaleleri okuyup bunlar arasında yeni bağlantılar öneren bir araştırma yazılımıdır.",
            "Onu, hava tahmininden futbola kadar küçük bir kütüphanedeki her makaleyi okumuş, hiç yorulmayan bir araştırma asistanı gibi düşünebilirsiniz.",
            "Ona iki konu verirsiniz; o da bu ikisi arasında, makalelerin hiçbirinde açıkça yazmayan yeni bir bağlantı önerir.",
            "Ardından elinde fosforlu kalemle dikkatli bir okur gibi, kendi fikrinin hangi kısımlarının makalelerle desteklendiğini, hangilerinin tahmin olduğunu işaretler.",
            "Önerdiği fikirler bilim insanları için birer başlangıç noktasıdır, bitmiş keşifler değil: her birinin gerçek dünyada sınanması gerekir.",
        ],
        "how_lead": "Her fikir aynı dört adımdan geçer. Bir çalıştırma yaklaşık {secs} saniye sürer ve yaklaşık {cost} tutar.",
        "steps": [
            ("İki konu seç",
             "Kullanıcı iki araştırma konusu belirler; örneğin “mahsul verimi tahmini” ve “CLIP” (resimlerle kelimeleri eşleştiren bir yapay zekâ)."),
            ("Parçaları bul",
             "LIBRAIN kütüphanede anlama göre arama yapar ve her konuya en yakın {topk} metin parçasını çıkarır."),
            ("Fikir öner",
             "Claude Sonnet 4.6 yalnızca bu parçaları okuyup bir hipotez yazar. Makalelerin ötesine geçen kısma <b>yeni iddia</b> denir. Her kaynak gösterimi bu parçalardan birine işaret etmek zorundadır."),
            ("Denetle ve puanla",
             "Claude Haiku 4.5, yeni iddianın her cümlesini parçalarla karşılaştırır ve trafik ışığı renginde bir etiket verir. Fikir ayrıca yenilik, akla yatkınlık ve yapı açısından puanlanır."),
        ],
        "shot_caption": ("<b>Ekranda nasıl görünüyor?</b> LIBRAIN web uygulamasının Discover (Keşfet) ekranı. Yeni iddianın her cümlesi "
                         "aldığı karara göre renklendirilir (burada biri sarı, biri kırmızı); yan panel de nedenini açıklar. "
                         "Bu, daha önceki bir örnek çalıştırmadır; bu kitapçıktakilerden biri değildir."),
        "terms_lead": "Bazı kelimeler sık sık karşınıza çıkacak. Bütün puanlar 0 ile 1 arasındadır. Gündelik örnekler yalnızca fikir vermek için seçildi.",
        "scale": "Ölçek", "example": "Örnek", "watch": "Dikkat",
        "results_lead": "İlk grupta LIBRAIN {n} kez çalıştırıldı; her seferinde farklı bir konu çifti verildi. Sonuçların her denetimden nasıl geçtiği aşağıda.",
        "caveat": ("<b>Önce bunu okuyun.</b> Bunlar, <b>LIBRAIN'in kendi denetimlerinden geçme</b> oranlarıdır. "
                   "Hiçbir fikrin doğru olduğunu <b>kanıtlamazlar</b>. Buradaki her fikir, gerçek bir deneyle sınanması gereken bir adaydır."),
        "lights_expl": ("Cümlelerin çoğu sarı ve bu beklenen bir durum: yeni iddia, tanımı gereği makalelerin ötesine geçen kısımdır; "
                        "bu yüzden temkinli bir tahmin olarak yazılmalıdır. Makalelerle tamamen desteklenen (yeşil) cümle sayısı {g}, "
                        "kırmızıyla işaretlenen cümle sayısı {r}."),
        "featured_lead": ("{n} sonucun hepsi okunduktan sonra {k} tanesi öne çıkarıldı: her biri belirli bir mekanizmayı adlandırıyor, "
                          "sınanabilir ve farklı makaleler arasında köprü kuruyor. “Öneriyor” tam olarak öneri demektir: bu fikirlerin hiçbiri henüz sınanmadı."),
        "b2_featured_lead": ("{n} fikirden {k} tanesi, her alandan en az bir tane olacak şekilde, aynı ölçüte göre seçildi: belirli bir mekanizma, "
                             "onu sınamanın bir yolu ve makaleler arasında bir köprü. Hiçbiri henüz sınanmadı."),
        "f_suggests": "Ne öneriyor?", "f_test": "Nasıl sınanabilir?", "f_papers": "Hangi makaleleri birleştiriyor?",
        "f_red": "Kırmızı cümle neden önemli?", "f_green": "Bu cümle neden yeşil?",
        "assess_lead": "Proje sahibi nesnel bir bakış istedi: ne işe yarıyor, ne yaramıyor, neyin düzeltilmesi gerekiyor ve devam etmeye değer mi?",
        "strengths": "Güçlü yanlar", "limits": "Sınırlar", "improve": "Öncelik sırasına göre iyileştirmeler",
        "verdict": "Devam etmeye değer mi?", "milestone": "Önerilen sonraki adım",
        "labels": {GROUNDED: "KAYNAKLI", EXTRAPOLATED: "ÇIKARIM", RISKY: "RİSKLİ"},
        "score_names": {"novelty": "Yenilik", "plausibility": "Akla yatkınlık", "coherence": "Yapısal tutarlılık",
                        "quality": "Kalite", "risk": "İddia riski"},
    },
}

TERMS = {
    "en": [
        {"key": "novelty", "term": "Novelty",
         "plain": "How different the idea is from everything already in the library.",
         "scale": "0 = says the same as a passage already in the library; 1 = unlike anything in it. "
                  "LIBRAIN measures the distance in meaning between the idea and the single most similar passage.",
         "example": "In a cookbook library with 100 tomato-pasta recipes, “pasta with strawberries” has high novelty; one more tomato pasta has low novelty.",
         "watch": "It measures distance from <b>this</b> library only. An idea can look brand new here and be old news elsewhere."},
        {"key": "plausibility", "term": "Plausibility",
         "plain": "Would an expert find the idea believable, given the evidence?",
         "scale": "0 = not believable; 1 = very believable. Scored by an AI judge (Claude Haiku 4.5).",
         "example": "“Drinking water helps athletes recover” is high; “red socks make you run faster” is low.",
         "watch": "Believable is not the same as proven."},
        {"key": "coherence", "term": "Structural coherence",
         "plain": "Whether the claim, the evidence and the reasoning fit together.",
         "scale": "0 = the parts don't connect; 1 = each step clearly follows from the last. Scored by an AI judge.",
         "example": "A recipe that lists its ingredients and then gives the steps in order, versus a jumbled list where step 4 uses an ingredient that never appeared.",
         "watch": "A well-built argument can still be wrong."},
        {"key": "quality", "term": "Quality",
         "plain": "The average of the three scores above: one overall grade.",
         "scale": "0 to 1, like a report-card average.",
         "example": "As on a school report, a strong mark in one subject can make up for a weaker one.",
         "watch": "Graded by AI judges, not by human experts (novelty is a computed distance)."},
        {"key": "risk", "term": "Claim risk",
         "plain": "The chance that a sentence states something as fact that the sources don't back.",
         "scale": "0 = safe; 1 = very likely an unsupported “fact”. Each sentence gets its own number; "
                  "an idea's overall risk is that of its riskiest sentence.",
         "example": "“This restaurant might be good” is low risk, because it is hedged. “This restaurant won 3 Michelin stars last year”, said with no proof, is high risk.",
         "watch": "Low risk means “honestly worded”, not “correct”."},
        {"key": "lights", "term": "Sentence labels: a traffic light",
         "plain": "Every sentence of the novel claim gets one of three labels.",
         "lights": [
             (GROUNDED, "GROUNDED", "The papers say it."),
             (EXTRAPOLATED, "EXTRAPOLATED", "An educated guess, clearly worded as a guess (“could”, “might”)."),
             (RISKY, "RISKY", "Stated as fact without proof."),
         ],
         "watch": "Yellow is normal here: the novel claim is, by design, the part that goes beyond the papers."},
        {"key": "contract", "term": "Citation contract",
         "plain": "A rule: every reference must point to a passage LIBRAIN actually retrieved. Any reference that doesn't is deleted before you see the result.",
         "scale": "Not a score: a yes-or-no check on each reference.",
         "example": "A teacher checking a bibliography and crossing out the books that don't exist.",
         "watch": "It proves the cited passage exists, not that it fully supports the idea. The sentence check does that second job."},
        {"key": "halluc", "term": "Hallucination",
         "plain": "An AI confidently saying something false or made up, such as quoting a study that was never published.",
         "scale": "Not a score. Claim risk and the citation contract are LIBRAIN's defences against it.",
         "example": "A friend who, instead of saying “I don't know”, confidently gives you directions to a street that doesn't exist.",
         "watch": "No AI system can rule it out completely; LIBRAIN's checks make it visible."},
    ],
    "tr": [
        {"key": "novelty", "term": "Yenilik",
         "plain": "Fikrin, kütüphanede zaten bulunan her şeyden ne kadar farklı olduğu.",
         "scale": "0 = kütüphanedeki bir parçayla aynı şeyi söylüyor; 1 = hiçbir şeye benzemiyor. "
                  "LIBRAIN, fikir ile ona en çok benzeyen tek parça arasındaki anlam mesafesini ölçer.",
         "example": "İçinde 100 domatesli makarna tarifi olan bir yemek kitapları kütüphanesi düşünün: “çilekli makarna” yüksek yenilik puanı alır, bir domatesli makarna tarifi daha ise düşük.",
         "watch": "Yalnızca <b>bu</b> kütüphaneye olan uzaklığı ölçer. Bir fikir burada yepyeni görünüp başka yerde çoktan bilinen bir şey olabilir."},
        {"key": "plausibility", "term": "Akla yatkınlık",
         "plain": "Kanıtlara bakan bir uzman bu fikri inandırıcı bulur mu?",
         "scale": "0 = inandırıcı değil; 1 = çok inandırıcı. Puanı bir yapay zekâ hakem (Claude Haiku 4.5) verir.",
         "example": "“Su içmek sporcuların toparlanmasına yardım eder” yüksek puan alır; “kırmızı çorap giyen daha hızlı koşar” düşük.",
         "watch": "İnandırıcı olmak, kanıtlanmış olmak demek değildir."},
        {"key": "coherence", "term": "Yapısal tutarlılık",
         "plain": "İddianın, kanıtın ve akıl yürütmenin birbirine uyup uymadığı.",
         "scale": "0 = parçalar birbirine bağlanmıyor; 1 = her adım bir öncekinden açıkça çıkıyor. Puanı bir yapay zekâ hakem verir.",
         "example": "Önce malzemeleri sayıp sonra adımları sırayla veren bir tarif ile 4. adımda hiç sözü geçmemiş bir malzemeyi kullanan karmakarışık bir liste arasındaki fark.",
         "watch": "İyi kurulmuş bir akıl yürütme de yanlış olabilir."},
        {"key": "quality", "term": "Kalite",
         "plain": "Yukarıdaki üç puanın ortalaması; tek bir genel not.",
         "scale": "0 ile 1 arasında, tıpkı karne ortalaması gibi.",
         "example": "Karnede olduğu gibi, bir dersteki yüksek not başka bir dersteki zayıf notu telafi edebilir.",
         "watch": "Notu insan uzmanlar değil, yapay zekâ hakemler veriyor (yenilik ise hesaplanan bir mesafe)."},
        {"key": "risk", "term": "İddia riski",
         "plain": "Bir cümlenin, kaynakların desteklemediği bir şeyi gerçekmiş gibi söyleme olasılığı.",
         "scale": "0 = güvenli; 1 = büyük olasılıkla dayanaksız bir “gerçek”. Her cümle kendi puanını alır; "
                  "bir fikrin genel riski, en riskli cümlesinin puanıdır.",
         "example": "“Bu restoran iyi olabilir” düşük risklidir, çünkü temkinli söylenmiştir. Hiçbir kanıt olmadan “Bu restoran geçen yıl 3 Michelin yıldızı aldı” demek ise yüksek risklidir.",
         "watch": "Düşük risk “dürüstçe ifade edilmiş” demektir, “doğru” demek değildir."},
        {"key": "lights", "term": "Cümle etiketleri: bir trafik ışığı",
         "plain": "Yeni iddianın her cümlesi üç etiketten birini alır.",
         "lights": [
             (GROUNDED, "KAYNAKLI", "Makalelerde yazıyor."),
             (EXTRAPOLATED, "ÇIKARIM", "Bilgiye dayalı bir tahmin; tahmin olduğu açıkça belli (“-ebilir”, “olabilir”)."),
             (RISKY, "RİSKLİ", "Kanıt olmadan gerçekmiş gibi söylenmiş."),
         ],
         "watch": "Burada sarı normaldir: yeni iddia, tanımı gereği makalelerin ötesine geçen kısımdır."},
        {"key": "contract", "term": "Kaynak sözleşmesi",
         "plain": "Bir kural: her kaynak gösterimi, LIBRAIN'in gerçekten getirdiği bir parçaya işaret etmelidir. Etmeyen her gösterim, siz sonucu görmeden silinir.",
         "scale": "Bir puan değil; her kaynak için evet ya da hayır diye yapılan bir kontrol.",
         "example": "Kaynakçayı kontrol edip var olmayan kitapların üstünü çizen bir öğretmen.",
         "watch": "Gösterilen parçanın var olduğunu kanıtlar; fikri tam olarak desteklediğini değil. O ikinci işi cümle denetimi yapar."},
        {"key": "halluc", "term": "Halüsinasyon (uydurma)",
         "plain": "Bir yapay zekânın yanlış ya da uydurma bir şeyi kendinden emin biçimde söylemesi; örneğin hiç yayımlanmamış bir çalışmayı kaynak göstermesi.",
         "scale": "Bir puan değil. İddia riski ve kaynak sözleşmesi, LIBRAIN'in buna karşı savunmalarıdır.",
         "example": "“Bilmiyorum” demek yerine, var olmayan bir sokağa kendinden emin biçimde yol tarif eden bir arkadaş.",
         "watch": "Hiçbir yapay zekâ sistemi uydurmayı tamamen önleyemez; LIBRAIN'in denetimleri onu görünür kılar."},
    ],
}

# Used only while batch 2 does not exist yet (once it exists, its manifest is the source).
AREAS_PLANNED = {
    "kept": [("web development", "web geliştirme"), ("sport", "spor"), ("football", "futbol"),
             ("programming languages", "programlama dilleri"), ("future jobs", "geleceğin meslekleri")],
    "dropped_area": ("living without money or work", "parasız ve işsiz bir yaşam"),
    "dropped": {
        "en": ("Every society needs a way to allocate food, housing and care; even a universal basic income is money. "
               "And how people should live without work is a question of values and policy, which a tool grounded in papers "
               "cannot settle. Its researchable part, how AI changes jobs, is covered by “future jobs”."),
        "tr": ("Her toplumun yiyeceği, barınmayı ve bakımı bir şekilde paylaştırması gerekir; evrensel temel gelir bile paradır. "
               "Ayrıca insanların çalışmadan nasıl yaşaması gerektiği bir değerler ve politika sorusudur; makalelere dayanan bir araç "
               "bunu çözemez. Konunun araştırılabilir kısmı, yani yapay zekânın meslekleri nasıl değiştirdiği, “geleceğin meslekleri” başlığında ele alınıyor."),
    },
}


def assessment(lang, s_all, s1, ctx):
    """Strengths, limits, improvements and verdict (wording fixed by the owner; numbers from the data)."""
    rho = num(ctx["novelty_rho"], lang)
    per_idea = usd(s_all["cost_mean"], lang)
    papers = s_all["papers"]
    if lang == "en":
        top = (f" The top-scoring run of the first batch ({s1['top_id']}) was left out of the featured list because the idea already exists."
               if not s1["top_featured"] else "")
        return {
            "strengths": [
                "Every sentence is labelled, so you can see what is backed by the papers and what is a guess.",
                f"Citations are verified: {ctx['rq3_librain']} fabricated in LIBRAIN's output, against {ctx['rq3_naive']} for a simpler system in the paper's stress test.",
                f"Cheap and fast: about {per_idea} and about {SECONDS_PER_RUN} seconds per idea.",
                "Every run is saved and can be replayed and checked later.",
                "Given specific topics, it produces concrete “take this mechanism and use it there” ideas.",
            ],
            "limits": [
                f"Novelty only measures how far the wording sits from a small library ({papers} papers). In the paper it agreed only moderately with human novelty ratings (correlation {rho}), and nothing checks the idea against the wider literature.{top}",
                f"The judges are AI models, and their plausibility scores cluster on a few values (the {s_all['valid']} scores take only {s_all['plaus_distinct']} different values), so they are coarse.",
                "No idea has been tested in reality yet.",
                "Ideas often follow the same “combine X with Y” pattern, with few surprising predictions.",
                "Each run is one sample: running the same two topics again can give a different idea.",
                "The library is small and covers only a few fields.",
                "The models are from the 2025 generation; moving to newer models needs code changes.",
            ],
            "improve": [
                "A novelty check against the whole literature (an arXiv / Semantic Scholar search), not just the library.",
                "A testable prediction for every idea: the experiment, the expected result, and the result that would prove it wrong.",
                "Expert review, plus a track record of which ideas held up.",
                "Better search: keyword plus meaning search, re-ranking, and more papers per field.",
                "Newer models through the official SDK, comparing quality per dollar.",
                "Several judges with a finer scoring guide (rubric).",
                "“Domain packs”: ready-made libraries for one field, for example sports analytics.",
            ],
            "verdict_yes": "Yes, as an auditable idea generator and research assistant.",
            "verdict": [
                "Its distinctive value is the audit layer that shows what is proven and what is guessed.",
                "That makes it worth continuing as published research software, as a strong portfolio project, and possibly as a niche tool for literature-heavy teams (sports analytics, pharma), once the novelty check and testable predictions exist.",
                "It is <b>not</b> worth it if the goal is a fully automatic discovery machine: today's AI plus a small library cannot deliver verified discoveries.",
            ],
            "milestone": "A literature novelty check + testable predictions + a review by 10 experts. Then decide.",
        }
    top = (f" İlk grubun en yüksek puanlı çalıştırması ({s1['top_id']}), fikir zaten var olduğu için öne çıkanlar arasına alınmadı."
           if not s1["top_featured"] else "")
    return {
        "strengths": [
            "Her cümle etiketleniyor; neyin makalelerle desteklendiği, neyin tahmin olduğu açıkça görülüyor.",
            f"Kaynaklar doğrulanıyor: makaledeki zorlama testinde LIBRAIN'in çıktısındaki uydurma kaynak sayısı {ctx['rq3_librain']}, daha basit bir sistemde ise {ctx['rq3_naive']} idi.",
            f"Ucuz ve hızlı: fikir başına yaklaşık {per_idea} ve yaklaşık {SECONDS_PER_RUN} saniye.",
            "Her çalıştırma kaydediliyor; sonradan yeniden oynatılıp kontrol edilebiliyor.",
            "Konular belirgin olduğunda “şu mekanizmayı al, şurada kullan” türünden somut fikirler üretiyor.",
        ],
        "limits": [
            f"Yenilik puanı yalnızca metnin küçük bir kütüphaneye ({papers} makale) ne kadar uzak olduğunu ölçüyor. Makaledeki testte insanların yenilik puanlarıyla ancak orta düzeyde örtüştü (korelasyon {rho}) ve fikri daha geniş literatürle karşılaştıran bir kontrol yok.{top}",
            f"Hakemler de yapay zekâ modelleri ve akla yatkınlık puanları birkaç değerde toplanıyor ({s_all['valid']} puan yalnızca {s_all['plaus_distinct']} farklı değer alıyor); yani ölçüm kaba.",
            "Hiçbir fikir henüz gerçek dünyada sınanmadı.",
            "Fikirler çoğu zaman aynı “X'i Y ile birleştir” kalıbını izliyor; şaşırtıcı öngörüler az.",
            "Her çalıştırma tek bir örnek: aynı iki konuyla yeniden çalıştırınca farklı bir fikir çıkabilir.",
            "Kütüphane küçük ve yalnızca birkaç alanı kapsıyor.",
            "Modeller 2025 kuşağından; daha yeni modellere geçmek kod değişikliği gerektiriyor.",
        ],
        "improve": [
            "Yenilik kontrolünü yalnızca kütüphaneye karşı değil, bütün literatüre karşı yapmak (arXiv / Semantic Scholar araması).",
            "Her fikir için sınanabilir bir öngörü istemek: yapılacak deney, beklenen sonuç ve fikri çürütecek sonuç.",
            "Uzman değerlendirmesi ve hangi fikirlerin ayakta kaldığını gösteren bir geçmiş kaydı.",
            "Daha iyi arama: anahtar kelime ile anlam aramasını birleştirmek, sonuçları yeniden sıralamak ve alan başına daha çok makale.",
            "Resmî SDK üzerinden daha yeni modeller; dolar başına kalitenin karşılaştırılması.",
            "Daha ayrıntılı bir puanlama kılavuzuyla birden fazla hakem.",
            "“Alan paketleri”: tek bir alana özel hazır kütüphaneler; örneğin spor analitiği.",
        ],
        "verdict_yes": "Evet; denetlenebilir bir fikir üreticisi ve araştırma asistanı olarak.",
        "verdict": [
            "Onu farklı kılan şey, neyin kanıtlandığını ve neyin tahmin edildiğini gösteren denetim katmanı.",
            "Bu yüzden yayımlanmış bir araştırma yazılımı olarak, güçlü bir portföy projesi olarak ve yenilik kontrolü ile sınanabilir öngörüler eklendiğinde, literatürle yoğun çalışan ekipler (spor analitiği, ilaç sektörü) için niş bir araç olarak sürdürülmeye değer.",
            "Amaç tamamen otomatik bir keşif makinesiyse <b>değmez</b>: bugünkü yapay zekâ ve küçük bir kütüphane, doğrulanmış keşifler üretemez.",
        ],
        "milestone": "Literatür taramalı yenilik kontrolü + sınanabilir öngörüler + 10 uzmanın katıldığı bir değerlendirme. Karar ondan sonra.",
    }


# --------------------------------------------------------------------------------------------
# Score wording
# --------------------------------------------------------------------------------------------

def score_words(key, value, lang, s, run):
    en = lang == "en"
    if key == "novelty":
        if value < 0.25:
            return "close to what the library already says" if en else "kütüphanede yazılana yakın"
        if value < 0.45:
            return "moderately new compared to the library" if en else "kütüphaneye göre orta düzeyde yeni"
        return "far from anything in the library" if en else "kütüphanedeki her şeyden oldukça uzak"
    if key == "plausibility":
        if value >= 0.75:
            return "an expert would likely find it believable" if en else "uzman büyük olasılıkla inandırıcı bulur"
        if value >= 0.6:
            return "fairly believable, given the evidence" if en else "kanıtlara göre oldukça inandırıcı"
        if value >= 0.4:
            return "doubtful, given the evidence" if en else "kanıtlara göre şüpheli"
        return "hard to believe, given the evidence" if en else "kanıtlara göre inanması güç"
    if key == "coherence":
        if value >= 0.7:
            return "claim, evidence and reasoning fit well" if en else "iddia, kanıt ve akıl yürütme uyumlu"
        if value >= 0.55:
            return "the parts mostly fit together" if en else "parçalar büyük ölçüde örtüşüyor"
        return "the parts connect only loosely" if en else "parçalar arasındaki bağ zayıf"
    if key == "quality":
        avg = s["summary"]["quality"][0]
        a = num(avg, lang)
        if value > avg + 0.02:
            return f"above this batch's average ({a})" if en else f"bu grubun ortalamasının ({a}) üstünde"
        if value < avg - 0.02:
            return f"below this batch's average ({a})" if en else f"bu grubun ortalamasının ({a}) altında"
        return f"close to this batch's average ({a})" if en else f"bu grubun ortalamasına ({a}) yakın"
    # claim risk: driven by the sentence verdicts, not by a threshold
    st = [c.get("status") for c in claims_of(run)]
    if RISKY in st:
        return "high: a fact stated without proof" if en else "yüksek: kanıtsız bir iddia var"
    if st and all(x == GROUNDED for x in st):
        return "very low: the papers say it" if en else "çok düşük: makalelerde yazıyor"
    return "low: no unsupported fact stated" if en else "düşük: dayanaksız bir iddia yok"


# --------------------------------------------------------------------------------------------
# Small components and SVG
# --------------------------------------------------------------------------------------------

def bi(en_html, tr_html, cls=""):
    """One row of parallel text: English left, Turkish right."""
    return (f'<div class="bi {cls}"><div class="c-en" lang="en">{en_html}</div>'
            f'<div class="c-tr" lang="tr">{tr_html}</div></div>')


def bi_t(key_or_pair, tag="p", cls=""):
    """Parallel row from a T key, or from an (en, tr) pair of HTML strings."""
    en, tr = (T["en"][key_or_pair], T["tr"][key_or_pair]) if isinstance(key_or_pair, str) else key_or_pair
    c = f' class="{cls}"' if cls else ""
    return bi(f"<{tag}{c}>{en}</{tag}>", f"<{tag}{c}>{tr}</{tag}>")


def icon(status, size=12):
    if status == GROUNDED:
        return (f'<svg class="ic" width="{size}" height="{size}" viewBox="0 0 12 12" aria-hidden="true">'
                '<circle cx="6" cy="6" r="5.5" fill="#0ca30c"/>'
                '<path d="M3.4 6.2l1.8 1.8 3.4-3.6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    if status == EXTRAPOLATED:
        return (f'<svg class="ic" width="{size}" height="{size}" viewBox="0 0 12 12" aria-hidden="true">'
                '<circle cx="6" cy="6" r="5.5" fill="#fab219"/>'
                '<circle cx="6" cy="6" r="3.2" fill="none" stroke="#5c3d00" stroke-width="1.1" stroke-dasharray="1.6 1.3"/></svg>')
    return (f'<svg class="ic" width="{size}" height="{size}" viewBox="0 0 12 12" aria-hidden="true">'
            '<path d="M6 0.8l5.4 9.6H0.6z" fill="#d03b3b" stroke="#d03b3b" stroke-width="0.8" stroke-linejoin="round"/>'
            '<path d="M6 4.2v3" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><circle cx="6" cy="8.9" r="0.8" fill="#fff"/></svg>')


def bar(value, cls=""):
    v = max(0.0, min(1.0, value))
    return f'<span class="bar {cls}"><span style="width:{v * 100:.1f}%"></span></span>'


def steps_svg():
    w, h = 680, 128
    bw, gap = 146, 32
    icons = [
        '<circle cx="-7" cy="0" r="11" fill="#cde2fb" stroke="#2a78d6" stroke-width="1.6"/>'
        '<circle cx="7" cy="0" r="11" fill="#fde3d6" stroke="#c8553d" stroke-width="1.6" fill-opacity="0.85"/>'
        '<text x="-10" y="4" font-size="10" font-weight="700" fill="#184f95" text-anchor="middle">A</text>'
        '<text x="10" y="4" font-size="10" font-weight="700" fill="#8e3420" text-anchor="middle">B</text>',
        '<rect x="-14" y="-14" width="18" height="23" rx="2" fill="#fff" stroke="#1d2433" stroke-width="1.4"/>'
        '<path d="M-10 -8h10M-10 -4h10M-10 0h7" stroke="#9aa1ad" stroke-width="1.3"/>'
        '<circle cx="6" cy="4" r="7" fill="#cde2fb" fill-opacity="0.7" stroke="#2a78d6" stroke-width="1.8"/>'
        '<path d="M11 9l5 5" stroke="#2a78d6" stroke-width="2.4" stroke-linecap="round"/>',
        '<path d="M0 -15a10 10 0 0 1 6 18v4h-12v-4a10 10 0 0 1 6 -18z" fill="#fff3d6" stroke="#b07800" stroke-width="1.6" stroke-linejoin="round"/>'
        '<path d="M-5 11h10M-4 14.5h8" stroke="#b07800" stroke-width="1.6" stroke-linecap="round"/>'
        '<path d="M-17 -12l-4 -3M17 -12l4 -3M-19 0h-5M19 0h5" stroke="#b07800" stroke-width="1.4" stroke-linecap="round"/>',
        '<rect x="-8" y="-17" width="16" height="34" rx="5" fill="#1d2433"/>'
        '<circle cx="0" cy="-9.5" r="3.6" fill="#0ca30c"/><circle cx="0" cy="0" r="3.6" fill="#fab219"/>'
        '<circle cx="0" cy="9.5" r="3.6" fill="#d03b3b"/>',
    ]
    label = " → ".join(s[0] for s in T["en"]["steps"])
    parts = [f'<svg class="steps" viewBox="0 0 {w} {h}" role="img" aria-label="{esc(label)}">']
    for i in range(4):
        x = i * (bw + gap)
        cx = x + bw / 2
        parts.append(f'<rect x="{x + 1}" y="1" width="{bw - 2}" height="{h - 2}" rx="12" fill="#f7f5f0" stroke="#e4e1d8" stroke-width="1.2"/>')
        parts.append(f'<circle cx="{x + 18}" cy="19" r="10" fill="#1d2433"/>'
                     f'<text x="{x + 18}" y="23" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">{i + 1}</text>')
        parts.append(f'<g transform="translate({cx},46)">{icons[i]}</g>')
        parts.append(f'<text x="{cx}" y="92" font-size="13.5" font-weight="700" fill="#1d2433" text-anchor="middle">{esc(T["en"]["steps"][i][0])}</text>')
        parts.append(f'<text x="{cx}" y="110" font-size="12" fill="#a84a33" text-anchor="middle">{esc(T["tr"]["steps"][i][0])}</text>')
        if i < 3:
            ax = x + bw + 5
            parts.append(f'<path d="M{ax} {h / 2}h{gap - 12}" stroke="#2a78d6" stroke-width="2" stroke-linecap="round"/>'
                         f'<path d="M{ax + gap - 16} {h / 2 - 5}l6 5-6 5" fill="none" stroke="#2a78d6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')
    parts.append("</svg>")
    return "".join(parts)


def rate_rows(s):
    """(EN label, TR label, k, n, EN meaning, TR meaning) for the success rates."""
    return [
        ("Completed", "Tamamlanan", s["valid"], s["n"],
         "Runs that returned a complete, valid result.",
         "Eksiksiz ve geçerli bir sonuç döndüren çalıştırmalar."),
        ("Citations kept", "Tutulan kaynaklar", s["kept"], s["claimed"],
         "References the AI gave that point to a real retrieved passage, so the citation contract kept them.",
         "Yapay zekânın gösterdiği ve gerçekten getirilmiş bir parçaya işaret ettiği için kaynak sözleşmesinin tuttuğu kaynaklar."),
        ("Sentence check ran", "Cümle denetimi çalıştı", s["checked"], s["valid"],
         "Runs where the sentence-by-sentence check finished without an error.",
         "Cümle cümle denetimin hatasız tamamlandığı çalıştırmalar."),
        ("No red sentence", "Kırmızı cümle yok", s["no_risky"], s["checked"],
         "Ideas with no sentence marked RISKY.",
         "Hiçbir cümlesi RİSKLİ olarak işaretlenmeyen fikirler."),
        ("Believable (≥ 0.6)", "İnandırıcı (≥ 0,6)", s["plaus_ok"], s["valid"],
         "Ideas the AI judge rated 0.6 or higher for plausibility.",
         "Yapay zekâ hakemin akla yatkınlık için 0,6 ya da üstü puan verdiği fikirler."),
        ("Featured", "Öne çıkan", len(s["featured"]), s["n"],
         "The “discovery rate”: ideas picked out as worth featuring after a person read every result.",
         "“Keşif oranı”: tüm sonuçlar tek tek okunduktan sonra öne çıkarılmaya değer bulunan fikirler."),
    ]


def rates_svg(series):
    """series: list of (key, stats). One series -> single hue; several -> grouped bars with a legend."""
    rows = [rate_rows(s) for _, s in series]
    nrows = len(rows[0])
    ns = len(series)
    bar_h = 14 if ns == 1 else 7
    inner = 3 if ns == 1 else 2.5
    row_h = (bar_h * ns + inner * (ns - 1)) + (20 if ns == 1 else 18)
    top = 4
    w = 640
    lx, bx, bw = 196, 210, 330
    h = top + row_h * nrows + 20
    out = [f'<svg class="rates" viewBox="0 0 {w} {h}" role="img" aria-label="success rates">']
    for g in range(0, 101, 25):
        gx = bx + bw * g / 100
        out.append(f'<line x1="{gx}" y1="{top}" x2="{gx}" y2="{top + row_h * nrows - 8}" stroke="#e1e0d9" stroke-width="1"/>')
        out.append(f'<text x="{gx}" y="{h - 5}" font-size="10" fill="#7a8090" text-anchor="middle">{g}%</text>')
    for i in range(nrows):
        y0 = top + i * row_h
        block = bar_h * ns + inner * (ns - 1)
        mid = y0 + 6 + block / 2
        en, tr = rows[0][i][0], rows[0][i][1]
        out.append(f'<text x="{lx}" y="{mid - 1.5}" font-size="12" font-weight="700" fill="#1d2433" text-anchor="end">{esc(en)}</text>')
        out.append(f'<text x="{lx}" y="{mid + 12}" font-size="11" fill="#a84a33" text-anchor="end">{esc(tr)}</text>')
        for j, (key, _) in enumerate(series):
            _, _, k, n, _, _ = rows[j][i]
            p = k / n if n else 0
            y = y0 + 6 + j * (bar_h + inner)
            color = SERIES["b1"] if ns == 1 else SERIES[key]
            out.append(f'<rect x="{bx}" y="{y}" width="{bw}" height="{bar_h}" rx="3" fill="#f1efe9"/>')
            if p > 0:
                out.append(f'<rect x="{bx}" y="{y}" width="{max(bw * p, 6):.1f}" height="{bar_h}" rx="3" fill="{color}"/>')
            fs = 12 if ns == 1 else 8.4
            out.append(f'<text x="{bx + bw + 8}" y="{y + bar_h - (3 if ns == 1 else 1)}" font-size="{fs}" font-weight="700" fill="#1d2433">'
                       f'{round(100 * p)}%<tspan font-weight="400" fill="#6b7280">  {k}/{n}</tspan></text>')
    out.append("</svg>")
    return "".join(out)


def lights_svg(counts, total, h=24):
    w, gap = 640, 2
    colors = {GROUNDED: "#0ca30c", EXTRAPOLATED: "#fab219", RISKY: "#d03b3b"}
    segs = [(st, counts[st]) for st in (GROUNDED, EXTRAPOLATED, RISKY) if counts[st]]
    avail = w - gap * (len(segs) - 1)
    widths = [max(avail * c / total, 16) for _, c in segs]
    scale = avail / sum(widths)
    widths = [x * scale for x in widths]
    out = [f'<svg class="lights" viewBox="0 0 {w} {h}" role="img" aria-label="sentence labels">']
    x = 0
    for (st, c), sw in zip(segs, widths):
        out.append(f'<rect x="{x:.1f}" y="0" width="{sw:.1f}" height="{h}" rx="4" fill="{colors[st]}"/>')
        ink = "#1d2433" if st == EXTRAPOLATED else "#fff"
        out.append(f'<text x="{x + sw / 2:.1f}" y="{h / 2 + 4.5}" font-size="12.5" font-weight="700" fill="{ink}" text-anchor="middle">{c}</text>')
        x += sw + gap
    out.append("</svg>")
    return "".join(out)


def cover_art():
    spines = [(14, 70, "#e9e4d8"), (11, 82, "#d8d2c3"), (16, 64, "#efe9dc"), (12, 90, "#2a78d6"),
              (15, 74, "#e4ddcd"), (10, 60, "#d8d2c3"), (17, 86, "#efe9dc"), (12, 70, "#e9e4d8"),
              (14, 92, "#d8d2c3"), (11, 66, "#efe9dc"), (16, 80, "#c8553d"), (12, 72, "#e4ddcd"),
              (15, 62, "#e9e4d8"), (11, 84, "#d8d2c3"), (14, 70, "#efe9dc")]
    base, x = 150, 40
    parts = ['<svg class="cover-art" viewBox="0 0 520 170" aria-hidden="true">',
             f'<line x1="20" y1="{base + 1}" x2="500" y2="{base + 1}" stroke="#1d2433" stroke-width="2"/>']
    centers = []
    for w_, h_, c in spines:
        parts.append(f'<rect x="{x}" y="{base - h_}" width="{w_}" height="{h_}" rx="2" fill="{c}" stroke="#1d2433" stroke-opacity="0.18"/>')
        if c in ("#2a78d6", "#c8553d"):
            centers.append((x + w_ / 2, base - h_))
        x += w_ + 4
    (x1, y1), (x2, y2) = centers
    parts.append(f'<path d="M{x1} {y1 - 4} C {x1 + 20} {y1 - 70}, {x2 - 20} {y2 - 80}, {x2} {y2 - 4}" fill="none" '
                 'stroke="#1d2433" stroke-width="1.6" stroke-dasharray="4 4"/>')
    mx, my = (x1 + x2) / 2, min(y1, y2) - 58
    parts.append(f'<circle cx="{mx}" cy="{my}" r="15" fill="#fff" stroke="#1d2433" stroke-width="1.6"/>')
    parts.append(f'<circle cx="{mx - 6}" cy="{my}" r="3.2" fill="#0ca30c"/><circle cx="{mx}" cy="{my}" r="3.2" fill="#fab219"/>'
                 f'<circle cx="{mx + 6}" cy="{my}" r="3.2" fill="#d03b3b"/>')
    parts.append('<g transform="translate(400,40) rotate(-28)"><rect x="0" y="0" width="64" height="16" rx="3" fill="#fab219"/>'
                 '<rect x="64" y="2" width="14" height="12" rx="2" fill="#1d2433"/><path d="M0 0 l-12 8 l12 8z" fill="#f1c45a"/></g>')
    parts.append("</svg>")
    return "".join(parts)


# --------------------------------------------------------------------------------------------
# Sections
# --------------------------------------------------------------------------------------------

def h2(key, number, markers, en=None, tr=None):
    mk = f'<span class="mk">@@{key}@@</span>' if markers else ""
    en = en or T["en"]["toc_" + key]
    tr = tr or T["tr"]["toc_" + key]
    return (f'<h2 class="h2bi" id="{key}">{mk}<span class="c-en"><span class="num">{number}</span>{esc(en)}</span>'
            f'<span class="c-tr" lang="tr">{esc(tr)}</span></h2>')


def h3(en, tr, cls=""):
    return f'<h3 class="h3bi {cls}"><span class="c-en">{en}</span><span class="c-tr" lang="tr">{tr}</span></h3>'


def sec_what(s1, s2, markers):
    def facts(lang):
        c1 = integer(s1["chunks"], lang)
        if lang == "en":
            txt = f"For the first batch the library held {s1['papers']} papers, cut into {c1} passages (short pieces of text, roughly a page each)."
            if s2:
                txt += f" For the second batch, {s2['new_papers'] or s2['papers'] - s1['papers']} papers were added: {s2['papers']} papers and {integer(s2['chunks'], lang)} passages in all."
            return txt + " Two AI models made by Anthropic do the work: <b>Claude Sonnet 4.6</b> writes the idea, <b>Claude Haiku 4.5</b> checks and scores it."
        txt = f"İlk grupta kütüphanede {s1['papers']} makale vardı; bunlar {c1} metin parçasına (her biri kabaca bir sayfa uzunluğunda kısa bölümler) ayrıldı."
        if s2:
            txt += f" İkinci grup için {s2['new_papers'] or s2['papers'] - s1['papers']} makale eklendi; toplam {s2['papers']} makale ve {integer(s2['chunks'], lang)} parça oldu."
        return txt + " İşi Anthropic'in iki yapay zekâ modeli yapıyor: fikri <b>Claude Sonnet 4.6</b> yazıyor, <b>Claude Haiku 4.5</b> ise denetleyip puanlıyor."

    def col(lang):
        t = T[lang]
        lis = "".join(f"<li>{esc(x)}</li>" for x in t["what"])
        return f'<p class="lead">{esc(t["what_lead"])}</p><ol class="five">{lis}</ol><p class="facts">{facts(lang)}</p>'
    return f'<section class="sec">{h2("what", 1, markers)}{bi(col("en"), col("tr"))}</section>'


def sec_how(s_all, markers):
    def col(lang):
        t = T[lang]
        lead = t["how_lead"].format(secs=SECONDS_PER_RUN, cost=usd(s_all["cost_mean"], lang))
        steps = "".join(f'<li><b>{esc(title)}.</b> {desc.format(topk=s_all["topk"] or 5)}</li>' for title, desc in t["steps"])
        return f'<p>{esc(lead)}</p><ol class="steps-ol">{steps}</ol>'
    shot = ""
    if os.path.isfile(SCREENSHOT):
        with open(SCREENSHOT, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")
        shot = (f'<figure class="shot"><img src="data:image/png;base64,{b64}" alt="LIBRAIN Discover screen">'
                f'<figcaption>{bi(T["en"]["shot_caption"], T["tr"]["shot_caption"])}</figcaption></figure>')
    return f'<section class="sec">{h2("how", 2, markers)}{steps_svg()}{bi(col("en"), col("tr"))}{shot}</section>'


def term_col(lang, c):
    t = T[lang]
    body = [f'<h3>{esc(c["term"])}</h3><p class="plain">{c["plain"]}</p>']
    if c["key"] == "lights":
        items = "".join(f'<li>{icon(st, 13)}<b class="lab lab-{st}">{esc(lab)}</b> {esc(desc)}</li>' for st, lab, desc in c["lights"])
        body.append(f'<ul class="lightlist">{items}</ul>')
    else:
        body.append(f'<p><span class="k">{t["scale"]}</span> {c["scale"]}</p>')
        body.append(f'<p><span class="k">{t["example"]}</span> {esc(c["example"])}</p>')
    if c.get("watch"):
        body.append(f'<p class="watch"><span class="k">{t["watch"]}</span> {c["watch"]}</p>')
    return "".join(body)


def sec_terms(markers):
    cards = "".join(f'<div class="card term">{bi(term_col("en", e), term_col("tr", r))}</div>'
                    for e, r in zip(TERMS["en"], TERMS["tr"]))
    return (f'<section class="sec sec-break">{h2("terms", 3, markers)}{bi_t("terms_lead")}'
            f'<div class="cards">{cards}</div></section>')


def rates_table(s):
    trs = "".join(
        f'<tr><td class="rl"><b>{esc(en)}</b><br><span class="trl">{esc(tr)}</span></td><td>{esc(men)}</td>'
        f'<td lang="tr">{esc(mtr)}</td><td class="rv"><b>{round(100 * k / n) if n else 0}%</b><br><span>{k} / {n}</span></td></tr>'
        for en, tr, k, n, men, mtr in rate_rows(s))
    note_en = "" if s["dropped"] else " None this time: the model invented no references."
    note_tr = "" if s["dropped"] else " Bu kez hiç yok: model kaynak uydurmadı."
    trs += (f'<tr><td class="rl"><b>Deleted by the contract</b><br><span class="trl">Sözleşmenin sildikleri</span></td>'
            f'<td>References that pointed nowhere and were removed.{note_en}</td>'
            f'<td lang="tr">Hiçbir parçaya işaret etmediği için silinen kaynaklar.{note_tr}</td><td class="rv"><b>{s["dropped"]}</b></td></tr>')
    trs += (f'<tr><td class="rl"><b>Fabricated in the final output</b><br><span class="trl">Son çıktıdaki uydurma kaynaklar</span></td>'
            f'<td>References in the results you see that do not lead to a real retrieved passage.</td>'
            f'<td lang="tr">Gördüğünüz sonuçlarda gerçek bir parçaya götürmeyen kaynaklar.</td><td class="rv"><b>{s["fabricated_final"]}</b></td></tr>')
    return ('<table class="rates-t"><thead><tr><th>Rate · Oran</th><th>What it means</th><th lang="tr">Ne anlama geliyor?</th>'
            f'<th class="rv">Result · Sonuç</th></tr></thead><tbody>{trs}</tbody></table>')


SCORE_KEYS = ("quality", "novelty", "plausibility", "coherence", "risk")


def scores_table(cols):
    """cols: list of (header, stats)."""
    head = "".join(f'<th class="num-c">{h}</th>' for h, _ in cols)
    rows = []
    for key in SCORE_KEYS:
        cells = []
        for _, s in cols:
            mean, lo, hi = s["summary"][key]
            cells.append(f'<td class="num-c"><b>{mean:.2f}</b> <span class="rng">({lo:.2f} – {hi:.2f})</span></td>')
        rows.append(f'<tr><td class="rl"><b>{esc(T["en"]["score_names"][key])}</b> · <span class="trl">{esc(T["tr"]["score_names"][key])}</span></td>'
                    f'{"".join(cells)}<td class="bar-c">{bar(cols[-1][1]["summary"][key][0])}</td></tr>')
    return (f'<table class="scores-t"><thead><tr><th>Score · Puan</th>{head}<th></th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>'
            '<p class="note">Average, with the lowest – highest value in brackets. · Ortalama; parantez içinde en düşük – en yüksek değer.</p>')


def legend_lights(c):
    return "".join(f'<span class="lg">{icon(st, 12)} {esc(T["en"]["labels"][st])} · {esc(T["tr"]["labels"][st])}: <b>{c[st]}</b></span>'
                   for st in (GROUNDED, EXTRAPOLATED, RISKY))


def lights_text(lang, c):
    if lang == "en":
        return T["en"]["lights_expl"].format(g=c[GROUNDED], g_s=plural(c[GROUNDED], "sentence was", "sentences were"),
                                             r=c[RISKY], r_s=plural(c[RISKY], "was", "were"))
    return T["tr"]["lights_expl"].format(g=c[GROUNDED], r=c[RISKY])


def cost_text(lang, s, label_en="all {n} runs", label_tr="{n} çalıştırmanın"):
    if lang == "en":
        return (f"{usd(s['cost_total'], lang)} for {label_en.format(n=s['n'])}: {usd(s['cost_mean'], lang, 3)} per run on average "
                f"({usd(s['cost_min'], lang, 3)} – {usd(s['cost_max'], lang, 3)}), so about {usd(s['cost_mean'], lang)} per idea.")
    return (f"{label_tr.format(n=s['n'])} toplam maliyeti {usd(s['cost_total'], lang)}. Çalıştırma başına ortalama "
            f"{usd(s['cost_mean'], lang, 3)} ({usd(s['cost_min'], lang, 3)} – {usd(s['cost_max'], lang, 3)}); "
            f"yani fikir başına yaklaşık {usd(s['cost_mean'], lang)}.")


def context_block(ctx):
    lib, naive = ctx["flags_LIBRAIN"], ctx["flags_Naive-RAG"]
    en = (f"<ul><li>In blind reviews, human raters flagged hallucinations in <b>{lib}</b> LIBRAIN outputs, against <b>{naive}</b> for a "
          "simpler system (Naive-RAG: it fetches passages and lets the AI write, with none of LIBRAIN's checks).</li>"
          f"<li>In a stress test built to provoke invented references, the simpler system produced <b>{ctx['rq3_naive']}</b> fabricated "
          f"citations; LIBRAIN's output contained <b>{ctx['rq3_librain']}</b>.</li></ul>")
    tr = (f"<ul><li>Kör değerlendirmelerde insan değerlendiriciler LIBRAIN çıktılarında uydurma bulmadı (<b>{lib}</b>); daha basit bir "
          f"sistemde (Naive-RAG: parçaları getirip yapay zekâya yazdıran, LIBRAIN'in denetimlerinin hiçbirini yapmayan sistem) bu oran <b>{naive}</b> idi.</li>"
          f"<li>Uydurma kaynak üretmeye zorlayan bir stres testinde basit sistem <b>{ctx['rq3_naive']}</b> uydurma kaynak üretti; "
          f"LIBRAIN'in çıktısındaki uydurma kaynak sayısı ise <b>{ctx['rq3_librain']}</b>.</li></ul>")
    return (f'<div class="context keep">{h3("For context: earlier results from the LIBRAIN paper", "Bağlam: LIBRAIN makalesindeki önceki sonuçlar")}'
            f'{bi(en, tr)}</div>')


def sec_results(s1, ctx, markers):
    caveat = f'<div class="caveat">{bi(T["en"]["caveat"], T["tr"]["caveat"])}</div>'
    lead = bi(f'<p>{esc(T["en"]["results_lead"].format(n=s1["n"]))}</p>', f'<p>{esc(T["tr"]["results_lead"].format(n=s1["n"]))}</p>')
    c = s1["counts"]
    lt_en = f"All {s1['sentences']} sentences of the {s1['checked']} novel claims, by label"
    lt_tr = f"{s1['checked']} yeni iddiadaki {s1['sentences']} cümlenin etiketleri"
    sc_en, sc_tr = f"Scores across all {s1['valid']} ideas", f"{s1['valid']} fikrin puanları"
    lights = (f'<div class="keep">{h3(lt_en, lt_tr)}'
              f'{lights_svg(c, s1["sentences"])}<div class="legend">{legend_lights(c)}</div>'
              f'{bi("<p class=small>" + esc(lights_text("en", c)) + "</p>", "<p class=small>" + esc(lights_text("tr", c)) + "</p>")}</div>')
    cost = (f'<div class="keep">{h3("Cost", "Maliyet")}'
            f'{bi("<p>" + esc(cost_text("en", s1)) + "</p>", "<p>" + esc(cost_text("tr", s1)) + "</p>")}</div>')
    return (f'<section class="sec sec-break">{h2("results", 4, markers)}{lead}{caveat}'
            f'{h3("Share that passed each check", "Her denetimden geçenlerin payı")}{rates_svg([("b1", s1)])}{rates_table(s1)}'
            f'<div class="keep">{h3(sc_en, sc_tr)}'
            f'{scores_table([(f"Batch 1 · Grup 1", s1)])}</div>'
            f'{lights}{cost}{context_block(ctx)}</section>')


# ---- featured -------------------------------------------------------------------------------

def first_pct(text, lang):
    m = re.search(r"(\d+(?:\.\d+)?)\s?%", text or "")
    if not m:
        return ""
    raw = m.group(1)
    return pct_value(float(raw), lang, len(raw.split(".")[1]) if "." in raw else 0)


def first_pct_range(text, lang):
    m = re.search(r"(\d+(?:\.\d+)?)\s?[–-]\s?(\d+(?:\.\d+)?)\s?%", text or "")
    if not m:
        return ""
    a, b = (x.replace(".", ",") if lang == "tr" else x for x in m.groups())
    return f"%{a}–{b}" if lang == "tr" else f"{a}–{b}%"


def area_names(copy, name):
    if not name:
        return None
    entry = copy.get("areas", {}).get(name, {})
    return entry.get("en", name), entry.get("tr", name)


def featured_card(b, fid, idx, total, s, copy):
    run = b["by_id"][fid]
    r = run["response"]
    e = r["evaluation"]
    claims = claims_of(run)
    risky = [c for c in claims if c.get("status") == RISKY]
    grounded = [c for c in claims if c.get("status") == GROUNDED]
    entry = copy.get(b["name"], {}).get(fid, {})
    fill = {
        "claim_pct": "", "claim_pct_range": "", "risky_pct": "", "risky_score": "", "grounded_score": "",
    }
    manifest_item = next((f for f in b["manifest"].get("featured", []) if f.get("id") == fid), {})
    req = run["request"]
    area = area_names(copy, area_of(b, fid))

    def col(lang):
        f = dict(fill)
        f["claim_pct"] = first_pct(r.get("novelClaim"), lang)
        f["claim_pct_range"] = first_pct_range(r.get("novelClaim"), lang)
        if risky:
            f["risky_pct"] = first_pct(risky[0]["sentence"], lang)
            f["risky_score"] = num(risky[0]["factualHallucinationProbability"], lang)
        if grounded:
            f["grounded_score"] = num(grounded[0]["factualHallucinationProbability"], lang)
        t = T[lang]
        c = entry.get(lang)
        if c:
            title = c["title"].format(**f)
            out = [f'<h3 class="dt">{esc(title)}</h3><h4>{esc(t["f_suggests"])}</h4><p>{esc(c["suggests"].format(**f))}</p>']
        else:
            title = f'{req["topicA"]} × {req["topicB"]}'
            fb = "" if lang == "en" else '<p class="small muted">Türkçe özet henüz yazılmadı; listedeki İngilizce özet aşağıda.</p>'
            out = [f'<h3 class="dt">{esc(title)}</h3><h4>{esc(t["f_suggests"])}</h4>{fb}<p lang="en">{esc(manifest_item.get("takeaway", ""))}</p>']
        return out, c, f

    parts = {}
    for lang in LANGS:
        out, c, f = col(lang)
        t = T[lang]
        note_txt = (c or {}).get("note", "").format(**f) if c else ""
        kind = (c or {}).get("note_kind", "risky")
        if risky and not note_txt:
            kind = "risky"
            note_txt = ("A sentence was marked red (RISKY): it states something as fact that the retrieved passages do not back. "
                        "This is the audit working: the system catches an overreach in its own idea." if lang == "en" else
                        "Bir cümle kırmızıyla (RİSKLİ) işaretlendi: getirilen parçaların desteklemediği bir şeyi gerçekmiş gibi söylüyor. "
                        "Bu, denetimin işlediğini gösteriyor: sistem kendi fikrindeki abartıyı yakalıyor.")
        note = ""
        if note_txt:
            st, head = (GROUNDED, t["f_green"]) if kind == "grounded" else (RISKY, t["f_red"])
            note = f'<div class="note-box nb{st}"><b>{icon(st, 12)} {esc(head)}</b><p>{esc(note_txt)}</p></div>'
        test = f'<p class="li"><b class="lead-in">{esc(t["f_test"])}</b> {esc(c["test"].format(**f))}</p>' if c and c.get("test") else ""
        papers = sorted({ev["paperId"] for ev in r.get("supportingEvidence", [])})
        titles = {p.get("arxivId"): p.get("title") for p in b["manifest"].get("newPapers", [])}
        labels = copy.get("papers", {})
        plist = '<span class="sep">; </span>'.join(
            f'<code>{esc(p)}</code> {esc(labels.get(p, {}).get(lang) or titles.get(p) or "")}' for p in papers)
        parts[lang] = {"top": "".join(out), "note": note,
                       "rest": f'{test}<p class="papers"><b class="lead-in">{esc(t["f_papers"])}</b> {plist}</p>'}

    if claims:
        sents = "".join(
            f'<span class="sent s{c_.get("status", 1)}">{icon(c_.get("status", 1), 11)}'
            f'<span class="tag">{esc(T["en"]["labels"][c_.get("status", 1)])} · {esc(T["tr"]["labels"][c_.get("status", 1)])} · '
            f'{c_.get("factualHallucinationProbability", 0):.2f}</span> {esc(c_["sentence"])}</span> ' for c_ in claims)
    else:
        sents = esc(r.get("novelClaim", ""))
    claim = (f'<div class="claimbox"><div class="cb-h"><b>The novel claim, word for word</b> · <b lang="tr">Yeni iddia, kelimesi kelimesine</b> '
             f'<span>(as generated / üretildiği gibi, İngilizce)</span></div><blockquote class="claim" lang="en">{sents}</blockquote></div>')
    rows = []
    for key, val in (("novelty", e["noveltyScore"]), ("plausibility", e["plausibilityScore"]),
                     ("coherence", e["structuralCoherenceScore"]), ("quality", e["qualityScore"]),
                     ("risk", r["claimValidation"]["aggregateRisk"])):
        cls = ("risk-hi" if risky else "risk-lo") if key == "risk" else ""
        rows.append(f'<tr><td class="sn">{esc(T["en"]["score_names"][key])}</td>'
                    f'<td class="sb">{bar(val, cls)}</td><td class="sv">{val:.2f}</td>'
                    f'<td class="sw">{esc(score_words(key, val, "en", s, run))}</td>'
                    f'<td class="sw" lang="tr"><b>{esc(T["tr"]["score_names"][key])}</b> {esc(score_words(key, val, "tr", s, run))}</td></tr>')
    scores = f'<table class="sc-t"><tbody>{"".join(rows)}</tbody></table>'
    area_html = (f'<span class="area">{esc(area[0])} · <span lang="tr">{esc(area[1])}</span></span>' if area else "")
    meta = (f'<div class="disc-meta"><span class="pill">{idx}/{total}</span><span class="rid">{esc(fid)}</span>{area_html}'
            f'<span class="topics">{esc(req["topicA"])} <span class="x">×</span> {esc(req["topicB"])}</span></div>')
    note_row = bi(parts["en"]["note"], parts["tr"]["note"]) if parts["en"]["note"] or parts["tr"]["note"] else ""
    return (f'<article class="disc">{meta}{bi(parts["en"]["top"], parts["tr"]["top"])}{claim}{scores}{note_row}'
            f'{bi(parts["en"]["rest"], parts["tr"]["rest"])}</article>')


def featured_cards(b, s, copy):
    ids = s["featured"]
    return "".join(featured_card(b, fid, i + 1, len(ids), s, copy) for i, fid in enumerate(ids))


def sec_featured(b1, s1, copy, markers):
    lead = bi(f'<p>{esc(T["en"]["featured_lead"].format(n=s1["n"], k=len(s1["featured"])))}</p>',
              f'<p>{esc(T["tr"]["featured_lead"].format(n=s1["n"], k=len(s1["featured"])))}</p>')
    return f'<section class="sec sec-break">{h2("featured", 5, markers)}{lead}{featured_cards(b1, s1, copy)}</section>'


# ---- batch 2 --------------------------------------------------------------------------------

def sec_batch2(b1, b2, s1, s2, s_all, ctx, copy, markers):
    if b2 is None:
        kept_en = ", ".join(e for e, _ in AREAS_PLANNED["kept"])
        kept_tr = ", ".join(t for _, t in AREAS_PLANNED["kept"])
        de, dt = AREAS_PLANNED["dropped_area"]
        en = (f'<div class="pending">A second batch of {PLANNED_BATCH2_RUNS} runs will connect AI with everyday areas: {esc(kept_en)}. '
              'Its results are not in yet, so they are <b>coming in the final version</b> of this booklet.</div>'
              f'<div class="dropped"><b>Dropped: “{esc(de)}”</b><p>{esc(AREAS_PLANNED["dropped"]["en"])}</p></div>')
        tr = (f'<div class="pending">Yapay zekâyı gündelik alanlarla ({esc(kept_tr)}) buluşturan {PLANNED_BATCH2_RUNS} çalıştırmalık ikinci '
              'bir grup hazırlanıyor. Sonuçları henüz gelmedi; bu yüzden kitapçığın <b>son sürümünde eklenecek</b>.</div>'
              f'<div class="dropped"><b>Listeden çıkarılan: “{esc(dt)}”</b><p>{esc(AREAS_PLANNED["dropped"]["tr"])}</p></div>')
        return f'<section class="sec">{h2("batch2", 6, markers)}{bi(en, tr)}</section>'

    added = s2["new_papers"] or (s2["papers"] - s1["papers"])
    intro = bi(
        f"<p>The second batch ran {s2['n']} times and connected AI with everyday areas. {added} papers were added to the library for it "
        f"({s2['papers']} in all). Same pipeline, same models, same checks: the rates are computed exactly as in section 4.</p>",
        f"<p>İkinci grup {s2['n']} kez çalıştırıldı ve yapay zekâyı gündelik alanlarla buluşturdu. Bunun için kütüphaneye {added} makale "
        f"eklendi (toplam {s2['papers']}). Süreç, modeller ve denetimler aynı; oranlar 4. bölümdekiyle tamamen aynı yöntemle hesaplandı.</p>")
    # areas kept, with run and featured counts
    rows = []
    feat = set(s2["featured"])
    for a in b2["manifest"].get("areas", []):
        ids = [r["id"] for r in b2["runs"] if r["id"].startswith(a["prefix"])]
        en_n, tr_n = area_names(copy, a["name"])
        rows.append(f'<tr><td><b>{esc(en_n)}</b> · <span class="trl" lang="tr">{esc(tr_n)}</span></td><td class="n">{len(ids)}</td>'
                    f'<td class="n">{sum(1 for i in ids if i in feat)}</td><td class="ids">{esc(", ".join(ids))}</td></tr>')
    areas = (f'<table class="areas-t"><thead><tr><th>Area kept · Alan</th><th class="n">Runs · Çalıştırma</th>'
             f'<th class="n">Featured · Öne çıkan</th><th>IDs</th></tr></thead><tbody>{"".join(rows)}</tbody></table>')
    dropped = ""
    for d in b2["manifest"].get("droppedAreas", []):
        tr_entry = copy.get("droppedAreas", {}).get(d.get("area"), {})
        dropped += bi(f'<div class="dropped"><b>Dropped: “{esc(d.get("area", ""))}”</b><p>{esc(d.get("reason", ""))}</p></div>',
                      f'<div class="dropped"><b>Listeden çıkarılan: “{esc(tr_entry.get("tr_area", d.get("area", "")))}”</b>'
                      f'<p>{esc(tr_entry.get("tr_reason", d.get("reason", "")))}</p></div>')
    legend = "".join(f'<span class="lg"><i style="background:{SERIES[k]}"></i>{lab}</span>' for k, lab in
                     (("b1", f"Batch 1 · Grup 1 ({s1['n']})"), ("b2", f"Batch 2 · Grup 2 ({s2['n']})"),
                      ("all", f"All · Tümü ({s_all['n']})")))
    comp_rows = []
    r1, r2, ra = rate_rows(s1), rate_rows(s2), rate_rows(s_all)
    for x1, x2, xa in zip(r1, r2, ra):
        cells = "".join(f'<td class="rv"><b>{round(100 * x[2] / x[3]) if x[3] else 0}%</b> <span>{x[2]}/{x[3]}</span></td>' for x in (x1, x2, xa))
        comp_rows.append(f'<tr><td class="rl"><b>{esc(x1[0])}</b> · <span class="trl">{esc(x1[1])}</span></td>{cells}</tr>')
    for label_en, label_tr, key in (("Deleted by the contract", "Sözleşmenin sildikleri", "dropped"),
                                    ("Fabricated in the final output", "Son çıktıdaki uydurma kaynaklar", "fabricated_final")):
        cells = "".join(f'<td class="rv"><b>{s[key]}</b></td>' for s in (s1, s2, s_all))
        comp_rows.append(f'<tr><td class="rl"><b>{label_en}</b> · <span class="trl">{label_tr}</span></td>{cells}</tr>')
    cells = "".join(f'<td class="rv"><b>{usd(s["cost_total"], "en")}</b> <span>{usd(s["cost_mean"], "en", 3)}/run</span></td>' for s in (s1, s2, s_all))
    comp_rows.append(f'<tr><td class="rl"><b>Cost</b> · <span class="trl">Maliyet</span></td>{cells}</tr>')
    comp = ('<table class="comp-t"><thead><tr><th>Rate · Oran</th>'
            f'<th class="rv">Batch 1 · Grup 1</th><th class="rv">Batch 2 · Grup 2</th><th class="rv">All · Tümü</th></tr></thead>'
            f'<tbody>{"".join(comp_rows)}</tbody></table>')
    c2, ca = s2["counts"], s_all["counts"]
    lights = (f'<div class="keep">{h3("Sentence labels", "Cümle etiketleri")}'
              f'<p class="lab-row">Batch 2 · Grup 2 — {s2["sentences"]} sentences / cümle</p>{lights_svg(c2, s2["sentences"], 20)}'
              f'<div class="legend">{legend_lights(c2)}</div>'
              f'<p class="lab-row">All · Tümü — {s_all["sentences"]} sentences / cümle</p>{lights_svg(ca, s_all["sentences"], 20)}'
              f'<div class="legend">{legend_lights(ca)}</div></div>')
    cost = bi(f"<p>{esc(cost_text('en', s2, 'the {n} runs of batch 2'))} Together with batch 1: {esc(usd(s_all['cost_total'], 'en'))} for {s_all['n']} runs.</p>",
              f"<p>{esc(cost_text('tr', s2, 'İkinci gruptaki {n} çalıştırmanın'))} İlk grupla birlikte {s_all['n']} çalıştırmanın toplamı {esc(usd(s_all['cost_total'], 'tr'))}.</p>")
    lead2 = bi(f'<p>{esc(T["en"]["b2_featured_lead"].format(n=s2["n"], k=len(s2["featured"])))}</p>',
               f'<p>{esc(T["tr"]["b2_featured_lead"].format(n=s2["n"], k=len(s2["featured"])))}</p>')
    featured = (f'<div class="sub">{h3("Featured discoveries of the second batch", "İkinci grubun öne çıkan keşifleri", "big")}{lead2}'
                f'{featured_cards(b2, s2, copy)}</div>' if s2["featured"] else
                bi("<p class='muted'>No featured list has been published for this batch yet.</p>",
                   "<p class='muted'>Bu grup için henüz öne çıkanlar listesi yayımlanmadı.</p>"))
    return (f'<section class="sec sec-break">{h2("batch2", 6, markers)}{intro}{areas}{dropped}'
            f'{h3("Success rates: batch 2 and all runs together", "Başarı oranları: ikinci grup ve tüm çalıştırmalar")}{comp}'
            f'<div class="keep chart2"><div class="legend sl">{legend}</div>{rates_svg([("b1", s1), ("b2", s2), ("all", s_all)])}</div>'
            f'<div class="keep">{h3("Scores", "Puanlar")}{scores_table([("Batch 1", s1), ("Batch 2", s2), ("All · Tümü", s_all)])}</div>'
            f'{lights}{featured}</section>')


def sec_assess(s_all, s1, ctx, markers):
    a = {lang: assessment(lang, s_all, s1, ctx) for lang in LANGS}

    def rows(key, cls):
        return "".join(bi(f"<p>{x}</p>", f"<p>{y}</p>", f"item {cls}") for x, y in zip(a["en"][key], a["tr"][key]))

    improve = "".join(bi(f'<p><span class="n">{i + 1}</span>{x}</p>', f'<p><span class="n">{i + 1}</span>{y}</p>', "item imp")
                      for i, (x, y) in enumerate(zip(a["en"]["improve"], a["tr"]["improve"])))
    verdict = bi("".join([f'<p class="yes">{a["en"]["verdict_yes"]}</p>'] + [f"<p>{x}</p>" for x in a["en"]["verdict"]] +
                         [f'<p class="milestone"><b>{T["en"]["milestone"]}:</b> {esc(a["en"]["milestone"])}</p>']),
                 "".join([f'<p class="yes">{a["tr"]["verdict_yes"]}</p>'] + [f"<p>{x}</p>" for x in a["tr"]["verdict"]] +
                         [f'<p class="milestone"><b>{T["tr"]["milestone"]}:</b> {esc(a["tr"]["milestone"])}</p>']))
    return (f'<section class="sec sec-break">{h2("assess", 7, markers)}{bi_t("assess_lead")}'
            f'<div class="blk good">{h3(T["en"]["strengths"], T["tr"]["strengths"])}{rows("strengths", "chk")}</div>'
            f'<div class="blk warn">{h3(T["en"]["limits"], T["tr"]["limits"])}{rows("limits", "dash")}</div>'
            f'<div class="blk plain">{h3(T["en"]["improve"], T["tr"]["improve"])}{improve}</div>'
            f'<div class="verdict keep">{h3(T["en"]["verdict"], T["tr"]["verdict"])}{verdict}</div></section>')


def appendix(batches, copy, markers):
    blocks = []
    for label, b in batches:
        s = batch_stats(b)
        featured = set(s["featured"])
        runs = sorted([r for r in b["runs"] if is_valid(r)], key=lambda r: -r["response"]["evaluation"]["qualityScore"])
        rows = []
        for r in runs:
            e = r["response"]["evaluation"]
            star = "★" if r["id"] in featured else ""
            area = area_of(b, r["id"])
            tag = f'<span class="atag">{esc(area)}</span> ' if area else ""
            rows.append(
                f'<tr class="{"feat" if star else ""}"><td class="st">{star}</td><td class="id">{esc(r["id"])}</td>'
                f'<td>{tag}{esc(r["request"]["topicA"])} <span class="x">×</span> {esc(r["request"]["topicB"])}</td>'
                f'<td class="n">{e["qualityScore"]:.2f}</td><td class="n">{e["noveltyScore"]:.2f}</td>'
                f'<td class="n">{e["plausibilityScore"]:.2f}</td><td class="n">{r["response"]["claimValidation"]["aggregateRisk"]:.2f}</td>'
                f'<td class="n">${r.get("costUsd", 0):.3f}</td></tr>')
        for r in [r for r in b["runs"] if not is_valid(r)]:
            rows.append(f'<tr><td></td><td class="id">{esc(r["id"])}</td><td colspan="6">no valid result · geçerli sonuç yok</td></tr>')
        blocks.append(
            f'<h3>{esc(label)}</h3><table class="apx"><thead><tr><th></th><th>ID</th><th>Topics · Konular</th>'
            f'<th class="n">Quality<br>Kalite</th><th class="n">Novelty<br>Yenilik</th><th class="n">Plausib.<br>Akla yat.</th>'
            f'<th class="n">Risk<br>Risk</th><th class="n">Cost<br>Maliyet</th></tr></thead><tbody>{"".join(rows)}</tbody></table>')
    mk = '<span class="mk">@@apx@@</span>' if markers else ""
    return (f'<section class="appendix" id="apx"><h2 class="h2bi">{mk}<span class="c-en">Appendix: all runs</span>'
            f'<span class="c-tr" lang="tr">Ek: tüm çalıştırmalar</span></h2>'
            '<p class="small">Sorted by quality within each batch. ★ = featured. Decimals use a point. '
            '<span class="trl">· Her grup kendi içinde kaliteye göre sıralı. ★ = öne çıkan. Ondalıklar nokta ile gösterilmiştir.</span></p>'
            + "".join(blocks) + "</section>")


def cover(pages, s1, s2, built):
    def pg(key):
        return str(pages[key]) if pages and key in pages else "··"

    n_total = s1["n"] + (s2["n"] if s2 else 0)
    guide_en = [
        "Every section is written twice, side by side: <b>English on the left</b>, Turkish on the right. Charts, tables and the AI's own quoted words are shared.",
        "Short on time? Read section 1, the results (section 4), then any discovery that interests you.",
        "Colours: <b class='g'>green</b> = the papers say it, <b class='y'>yellow</b> = an educated guess, <b class='r'>red</b> = stated as fact without proof.",
        "Nothing here is a proven fact. Every idea is a candidate that would still need a real experiment.",
    ]
    guide_tr = [
        "Her bölüm iki kez, yan yana yazıldı: solda İngilizce, <b>sağda Türkçe</b>. Grafikler, tablolar ve yapay zekânın alıntılanan kendi cümleleri ortaktır.",
        "Vaktiniz az mı? 1. bölümü, sonuçları (4. bölüm) ve ilginizi çeken herhangi bir keşfi okuyun.",
        "Renkler: <b class='g'>yeşil</b> = makalelerde yazıyor, <b class='y'>sarı</b> = bilgiye dayalı bir tahmin, <b class='r'>kırmızı</b> = kanıtsız biçimde gerçekmiş gibi söylenmiş.",
        "Buradaki hiçbir şey kanıtlanmış bir gerçek değildir. Her fikir, gerçek bir deneyle sınanması gereken bir adaydır.",
    ]
    keys = ["what", "how", "terms", "results", "featured", "batch2", "assess"]
    toc = "".join(f'<li><span class="tn">{i + 1}</span><span class="te">{esc(T["en"]["toc_" + k])}</span>'
                  f'<span class="tt" lang="tr">{esc(T["tr"]["toc_" + k])}</span><b>{pg(k)}</b></li>' for i, k in enumerate(keys))
    toc += (f'<li><span class="tn"></span><span class="te">{esc(T["en"]["toc_appendix"])}</span>'
            f'<span class="tt" lang="tr">{esc(T["tr"]["toc_appendix"])}</span><b>{pg("apx")}</b></li>')
    version_en = "Final version" if s2 else "Version 1 · first batch of results"
    version_tr = "Son sürüm" if s2 else "Sürüm 1 · ilk sonuç grubu"
    based_en = f"Based on {n_total} discovery runs ({s1['date'] or ''})"
    based_tr = f"{n_total} keşif çalıştırmasına dayanır"
    return f'''
<section class="cover">
  <div class="cover-top"><span>LIBRAIN</span><span>{esc(version_en)} · {esc(version_tr)}</span></div>
  <h1>LIBRAIN — What it discovered, explained simply</h1>
  <p class="h1-tr" lang="tr">LIBRAIN — Neler keşfetti, basitçe anlatıldı</p>
  {cover_art()}
  <p class="byline"><b>{esc(AUTHOR)}</b> · {esc(date_str(built, "en"))} · <span lang="tr">{esc(date_str(built, "tr"))}</span></p>
  <p class="based">{esc(based_en)} · <span lang="tr">{esc(based_tr)}</span></p>
  <div class="guide">
    <div><h3>How to read this booklet</h3><ul>{"".join(f"<li>{x}</li>" for x in guide_en)}</ul></div>
    <div lang="tr"><h3>Bu kitapçık nasıl okunur?</h3><ul>{"".join(f"<li>{x}</li>" for x in guide_tr)}</ul></div>
  </div>
  <div class="toc-wrap"><h3>Contents · <span lang="tr">İçindekiler</span></h3><ul class="toc">{toc}</ul></div>
</section>'''


# --------------------------------------------------------------------------------------------
# Page
# --------------------------------------------------------------------------------------------

CSS = r"""
:root {
  --ink: #1d2433; --ink2: #3d4556; --muted: #6b7280; --rule: #e4e1d8; --wash: #f7f5f0; --wash2: #fbfaf7;
  --blue: #2a78d6; --blue-d: #184f95; --warm: #c8553d; --tr: #a84a33;
  --good: #0ca30c; --good-t: #e5f4e3; --good-ink: #006300;
  --warn: #fab219; --warn-t: #fff3d3; --warn-ink: #7a5200;
  --crit: #d03b3b; --crit-t: #fbe4e2; --crit-ink: #a12a2a;
}
@page { size: A4; margin: 16mm 15mm 15mm 15mm;
  @top-left { content: "English"; font: 7.5pt "Helvetica Neue", Arial, sans-serif; color: #8a8f99; letter-spacing: 0.08em; }
  @top-center { content: "LIBRAIN — explained simply · basitçe anlatıldı"; font: italic 7.5pt Georgia, serif; color: #a0a4ac; }
  @top-right { content: "Türkçe"; font: 7.5pt "Helvetica Neue", Arial, sans-serif; color: #a84a33; letter-spacing: 0.08em; }
  @bottom-center { content: counter(page); font: 8.5pt "Helvetica Neue", Arial, sans-serif; color: #8a8f99; } }
@page cover { margin: 0; @top-left { content: none; } @top-center { content: none; } @top-right { content: none; }
  @bottom-center { content: none; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #fff; color: var(--ink); font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 9pt; line-height: 1.45; overflow-wrap: break-word; }
h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; color: var(--ink); font-weight: 700; }
p { margin: 0 0 2mm; }
code { font-family: Menlo, "SF Mono", Consolas, monospace; font-size: 0.84em; background: var(--wash); padding: 0 0.6mm; border-radius: 2px; }
.small { font-size: 8.4pt; }
.muted { color: var(--muted); }
.note { font-size: 7.6pt; color: var(--muted); margin: 1mm 0 0; }
.mk { position: absolute; font-size: 1px; color: #fff; }
.keep { break-inside: avoid; }
.x { color: var(--muted); padding: 0 0.5mm; }
.trl { color: var(--tr); }

/* parallel columns */
.bi { display: grid; grid-template-columns: 1fr 1fr; }
.bi > .c-en { padding-right: 4.5mm; min-width: 0; }
.bi > .c-tr { padding-left: 4.5mm; border-left: 1px solid var(--rule); min-width: 0; }
h2.h2bi { display: grid; grid-template-columns: 1fr 1fr; font-size: 17pt; line-height: 1.2; margin: 0 0 3mm;
  padding-bottom: 2mm; border-bottom: 2px solid var(--ink); break-after: avoid; }
h2.h2bi .c-en { padding-right: 4.5mm; display: flex; align-items: baseline; gap: 2.6mm; }
h2.h2bi .c-tr { padding-left: 4.5mm; color: var(--tr); }
h2 .num { font-size: 10pt; color: #fff; background: var(--ink); border-radius: 50%; width: 6.6mm; height: 6.6mm;
  display: inline-flex; align-items: center; justify-content: center; flex: none; position: relative; top: -0.8mm;
  font-family: "Helvetica Neue", Arial, sans-serif; }
h3.h3bi { display: grid; grid-template-columns: 1fr 1fr; font-size: 11pt; margin: 4mm 0 1.6mm; break-after: avoid; }
h3.h3bi .c-en { padding-right: 4.5mm; }
h3.h3bi .c-tr { padding-left: 4.5mm; color: var(--tr); }
h3.h3bi.big { font-size: 14pt; margin-top: 2mm; padding-bottom: 1.5mm; border-bottom: 1px solid var(--rule); }
h4 { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 7.2pt; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--muted); margin: 2.2mm 0 0.8mm; break-after: avoid; }
.c-tr h4 { color: #b0786a; }
.sec { margin-bottom: 5mm; }
.sec-break { break-before: auto; }
.sec { margin-top: 7mm; }
main.doc > .sec:first-child { margin-top: 0; }
.lead { font-family: Georgia, serif; font-size: 11.5pt; font-style: italic; color: var(--ink2); margin-bottom: 2.5mm; line-height: 1.35; }

/* cover */
.cover { page: cover; height: 297mm; padding: 15mm 16mm 10mm; display: flex; flex-direction: column;
  background: linear-gradient(180deg, #f7f5f0 0, #f7f5f0 122mm, #fff 122mm); break-after: page; }
.cover-top { display: flex; justify-content: space-between; font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--muted); border-bottom: 1px solid var(--rule); padding-bottom: 2.5mm; }
.cover-top span:first-child { font-weight: 700; color: var(--ink); }
.cover h1 { font-size: 30pt; line-height: 1.1; margin: 10mm 0 2.5mm; letter-spacing: -0.01em; max-width: 165mm; }
.cover .h1-tr { font-family: Georgia, serif; font-size: 18pt; color: var(--warm); margin: 0 0 2mm; }
.cover-art { width: 118mm; height: auto; display: block; margin: 0 0 0 -4mm; }
.byline { margin: 6mm 0 0.5mm; font-size: 10.5pt; }
.based { color: var(--muted); font-size: 8.8pt; margin: 0; }
.guide { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 6mm; font-size: 8.7pt; line-height: 1.42; }
.guide h3 { font-size: 11pt; margin: 0 0 1.8mm; }
.guide > div[lang="tr"] h3 { color: var(--tr); }
.guide ul { padding-left: 4mm; margin: 0; }
.guide li { margin-bottom: 1.2mm; }
.guide b.g { color: var(--good-ink); } .guide b.y { color: var(--warn-ink); } .guide b.r { color: var(--crit-ink); }
.toc-wrap { margin-top: 5mm; }
.toc-wrap h3 { font-size: 11pt; margin: 0 0 1.5mm; }
.toc-wrap h3 span { color: var(--tr); }
ul.toc { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--rule); font-size: 9pt; }
ul.toc li { display: grid; grid-template-columns: 6mm 1fr 1fr 10mm; padding: 0.9mm 0; border-bottom: 1px dotted #d9d5ca; }
ul.toc .tn { color: var(--muted); }
ul.toc .tt { color: var(--tr); }
ul.toc b { text-align: right; font-variant-numeric: tabular-nums; color: var(--blue-d); }

/* what / how */
ol.five { margin: 0 0 2.5mm; padding-left: 5mm; font-size: 9.4pt; line-height: 1.45; }
ol.five li { margin-bottom: 1.2mm; padding-left: 0.5mm; }
ol.five li::marker { font-family: Georgia, serif; font-weight: 700; color: var(--warm); }
.facts { background: var(--wash); border-left: 3px solid var(--blue); padding: 2.2mm 3mm; border-radius: 0 6px 6px 0; font-size: 8.6pt; }
svg.steps { width: 100%; height: auto; display: block; margin: 1mm 0 3mm; font-family: "Helvetica Neue", Arial, sans-serif; }
ol.steps-ol { padding-left: 4.5mm; margin: 0; font-size: 8.7pt; }
ol.steps-ol li { margin-bottom: 1.2mm; }
ol.steps-ol li::marker { font-weight: 700; }
figure.shot { margin: 4mm 0 0; break-inside: avoid; }
figure.shot img { width: 74%; margin: 0 auto; border: 1px solid var(--rule); border-radius: 6px; display: block; }
figure.shot figcaption { font-size: 8pt; color: var(--ink2); margin-top: 2mm; line-height: 1.38; }

/* terms */
.cards { display: flex; flex-direction: column; gap: 2.6mm; }
.card { background: var(--wash2); border: 1px solid var(--rule); border-radius: 8px; padding: 2.6mm 3.4mm 1.4mm; break-inside: avoid;
  font-size: 8.5pt; line-height: 1.4; }
.card h3 { margin: 0 0 0.8mm; font-size: 11pt; }
.card .c-tr h3 { color: var(--tr); }
.card p { margin: 0 0 1.3mm; }
.card .plain { font-weight: 600; }
.card .k { display: inline-block; font-size: 6.6pt; letter-spacing: 0.07em; text-transform: uppercase; font-weight: 700;
  color: var(--blue-d); background: #e9f1fc; border-radius: 3px; padding: 0.1mm 1.1mm; margin-right: 0.8mm; position: relative; top: -0.3mm; }
.card .watch .k { color: var(--warn-ink); background: var(--warn-t); }
ul.lightlist { list-style: none; padding: 0; margin: 0 0 1.3mm; }
ul.lightlist li { margin-bottom: 1mm; }
ul.lightlist .ic { position: relative; top: 2px; margin-right: 1.2mm; }
.lab { font-size: 7.2pt; letter-spacing: 0.05em; padding: 0.2mm 1.1mm; border-radius: 3px; }
.lab-0 { background: var(--good-t); color: var(--good-ink); }
.lab-1 { background: var(--warn-t); color: var(--warn-ink); }
.lab-2 { background: var(--crit-t); color: var(--crit-ink); }

/* results */
.caveat { background: var(--warn-t); border: 1px solid #f3d58c; border-radius: 8px; padding: 2.4mm 3.2mm 0.6mm; margin: 1mm 0 1mm; }
.caveat .c-tr { border-left-color: #f0d590; }
svg.rates { width: 100%; height: auto; display: block; font-family: "Helvetica Neue", Arial, sans-serif; margin-top: 1mm; }
table { border-collapse: collapse; width: 100%; }
th { text-align: left; font-size: 7pt; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); font-weight: 700;
  border-bottom: 1.5px solid var(--ink); padding: 1.1mm 1.4mm; }
td { padding: 1.2mm 1.4mm; border-bottom: 1px solid var(--rule); vertical-align: top; }
tr { break-inside: avoid; }
.rates-t { margin-top: 2.5mm; font-size: 8.1pt; line-height: 1.35; }
.rates-t .rl { width: 23%; }
.rates-t .rv { text-align: right; width: 11%; white-space: nowrap; }
.rates-t .rv span { color: var(--muted); font-size: 7.6pt; }
.scores-t { font-size: 8.5pt; margin-top: 0.5mm; }
.scores-t .rl { width: 34%; }
.num-c { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rng { color: var(--muted); font-size: 7.6pt; }
.bar-c { width: 22%; vertical-align: middle; }
.bar { display: block; height: 6px; background: #f1efe9; border-radius: 3px; overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--blue); border-radius: 3px; }
.bar.risk-lo > span { background: var(--good); }
.bar.risk-hi > span { background: var(--crit); }
svg.lights { width: 100%; height: auto; display: block; font-family: "Helvetica Neue", Arial, sans-serif; }
.legend { display: flex; flex-wrap: wrap; gap: 5mm; font-size: 8pt; margin: 1.4mm 0 1.6mm; }
.legend .ic { position: relative; top: 2px; }
.legend.sl i { display: inline-block; width: 3mm; height: 3mm; border-radius: 1mm; margin-right: 1.4mm; position: relative; top: 0.4mm; }
.lab-row { font-size: 7.8pt; font-weight: 700; color: var(--muted); margin: 1.5mm 0 0.8mm; }
.context { margin-top: 3mm; border: 1px solid var(--rule); border-radius: 8px; padding: 0.5mm 3.2mm 0.5mm; background: var(--wash2); }
.context h3.h3bi { margin-top: 2mm; font-size: 10pt; }
.context ul { padding-left: 4mm; margin: 0 0 1.5mm; font-size: 8.5pt; }
.context li { margin-bottom: 1.1mm; }
.comp-t { font-size: 8.2pt; margin-top: 1mm; }
.chart2 { margin-top: 3mm; }
.sub > .bi { break-after: avoid; }
.comp-t .rl { width: 40%; }
.comp-t .rv { text-align: right; white-space: nowrap; }
.comp-t .rv span { color: var(--muted); font-size: 7.4pt; margin-left: 1mm; }
.areas-t { font-size: 8.4pt; margin: 2mm 0 3mm; }
.areas-t .n { text-align: right; width: 14%; }
.areas-t .ids { color: var(--muted); font-family: Menlo, monospace; font-size: 7.4pt; }
.pending { background: var(--wash); border: 1px dashed #cfc9ba; border-radius: 8px; padding: 2.6mm 3.4mm; margin-bottom: 3mm; }
.dropped { border-left: 3px solid var(--muted); padding: 0.4mm 0 0.4mm 3mm; margin-bottom: 2mm; font-size: 8.5pt; }
.dropped p { margin: 0.8mm 0 0; color: var(--ink2); }

/* featured cards */
.disc { border-top: 2.5px solid var(--ink); padding: 1.6mm 0 0.6mm; margin: 0 0 5.5mm; break-inside: auto; }
.disc > * { break-inside: avoid; }
.disc > .disc-meta { break-after: avoid; }
.disc-meta { display: flex; flex-wrap: wrap; gap: 1.6mm 2.4mm; align-items: baseline; font-size: 7.4pt; color: var(--muted);
  border-bottom: 1px solid var(--rule); padding-bottom: 1.1mm; margin-bottom: 1mm; }
.disc-meta .pill { background: var(--ink); color: #fff; border-radius: 10px; padding: 0.1mm 2mm; font-weight: 700; }
.disc-meta .rid { font-weight: 700; color: var(--ink); }
.disc-meta .area { background: #e9f1fc; color: var(--blue-d); border-radius: 8px; padding: 0.1mm 2mm; font-weight: 700; }
.disc-meta .area span { color: var(--tr); font-weight: 600; }
.disc-meta .topics { flex: 1 1 60mm; }
.disc h3.dt { font-size: 11pt; line-height: 1.22; margin: 0.6mm 0 0; }
.disc .c-tr h3.dt { color: var(--tr); }
.disc p { margin: 0 0 1.2mm; font-size: 8.4pt; line-height: 1.4; }
.disc h4 { margin: 1.4mm 0 0.4mm; }
.lead-in { font-size: 7pt; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); margin-right: 0.8mm; }
.c-tr .lead-in { color: #b0786a; }
.claimbox { background: var(--wash2); border: 1px solid var(--rule); border-radius: 6px; padding: 1.3mm 2.4mm 0.4mm; margin: 1mm 0 1.2mm; }
.cb-h { font-size: 7.2pt; color: var(--muted); margin-bottom: 0.8mm; }
.cb-h b { color: var(--ink2); letter-spacing: 0.02em; } .cb-h b[lang="tr"] { color: var(--tr); }
blockquote.claim { margin: 0 0 0.8mm; font-family: Georgia, serif; font-size: 8.3pt; line-height: 1.52; color: var(--ink); }
.sent { padding: 0.3mm 0.5mm; border-radius: 3px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.sent.s0 { background: var(--good-t); border-bottom: 1.5px solid var(--good); }
.sent.s1 { background: var(--warn-t); border-bottom: 1.5px dashed #d9970b; }
.sent.s2 { background: var(--crit-t); border-bottom: 1.5px solid var(--crit); }
.sent .ic { position: relative; top: 1.5px; margin-right: 0.8mm; }
.sent .tag { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 6.3pt; font-weight: 700; letter-spacing: 0.04em; }
.sent.s0 .tag { color: var(--good-ink); } .sent.s1 .tag { color: var(--warn-ink); } .sent.s2 .tag { color: var(--crit-ink); }
table.sc-t { font-size: 7.4pt; line-height: 1.2; margin: 0 0 1.2mm; table-layout: fixed; }
table.sc-t td { padding: 0.55mm 1.1mm; border-bottom: 1px solid #efece5; vertical-align: middle; }
table.sc-t .sn { width: 17%; white-space: nowrap; font-weight: 700; }
table.sc-t .sb { width: 8%; }
table.sc-t .sv { width: 5%; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
table.sc-t .sw { width: 30%; color: var(--ink2); }
table.sc-t .sw[lang="tr"] { width: 40%; color: var(--tr); border-left: 1px solid var(--rule); padding-left: 2.4mm; }
table.sc-t .sw[lang="tr"] b { color: var(--tr); }
.note-box { border-radius: 6px; padding: 1.4mm 2.4mm 0.4mm; margin: 0 0 1.2mm; font-size: 8.2pt; }
.note-box p { margin: 0.6mm 0 1mm; font-size: 8.2pt; }
.note-box .ic { position: relative; top: 1.5px; }
.nb2 { background: var(--crit-t); }
.nb0 { background: var(--good-t); }
.disc p.papers { font-size: 7.6pt; line-height: 1.34; color: var(--ink2); margin-bottom: 1mm; }
.papers .sep { color: var(--muted); }

/* assessment */
.blk { border-radius: 8px; padding: 0.5mm 3.2mm 0.8mm; margin-bottom: 3mm; }
.blk h3.h3bi { margin-top: 2mm; }
.blk.good { background: var(--good-t); }
.blk.warn { background: var(--warn-t); }
.blk.plain { background: var(--wash2); border: 1px solid var(--rule); }
.bi.item { break-inside: avoid; }
.bi.item p { margin: 0 0 1.5mm; font-size: 8.6pt; line-height: 1.4; padding-left: 4.6mm; position: relative; }
.bi.item.chk p::before { content: "✓"; position: absolute; left: 0; color: var(--good-ink); font-weight: 700; }
.bi.item.dash p::before { content: "–"; position: absolute; left: 0.5mm; color: var(--warn-ink); font-weight: 700; }
.bi.item.imp p { padding-left: 6mm; }
.bi.item.imp .n { position: absolute; left: 0; width: 4.4mm; height: 4.4mm; border-radius: 50%; background: var(--blue-d); color: #fff;
  font-size: 7pt; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; top: 0.2mm; }
.blk .c-tr { border-left-color: rgba(0,0,0,0.08); }
.verdict { margin-top: 3mm; border: 2px solid var(--ink); border-radius: 10px; padding: 0.5mm 4mm 1mm; }
.verdict p { font-size: 8.8pt; }
.verdict .yes { font-family: Georgia, serif; font-size: 11.5pt; font-weight: 700; color: var(--good-ink); line-height: 1.3; }
.milestone { background: var(--wash); border-radius: 6px; padding: 1.8mm 2.6mm; }

/* appendix */
.appendix { break-before: page; }
.appendix h3 { font-size: 10pt; margin: 2.5mm 0 1.2mm; }
table.apx { font-size: 7.2pt; line-height: 1.26; }
table.apx th { font-size: 6.2pt; padding: 0.8mm 1mm; }
table.apx td { padding: 0.75mm 1mm; }
table.apx .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
table.apx .id { font-weight: 700; white-space: nowrap; }
table.apx .st { color: var(--warm); width: 3mm; }
table.apx tr.feat td { background: #fbf6ea; }
.atag { font-size: 6.4pt; font-weight: 700; color: var(--blue-d); background: #e9f1fc; border-radius: 3px; padding: 0 1mm; white-space: nowrap; }
"""


def render(b1, b2, copy, ctx, pages=None, markers=False, built=None):
    built = built or datetime.date.today()
    s1 = batch_stats(b1)
    s2 = batch_stats(b2) if b2 else None
    s_all = batch_stats(merge_batches([b1, b2])) if b2 else s1
    body = [
        cover(pages, s1, s2, built),
        '<main class="doc">',
        sec_what(s1, s2, markers),
        sec_how(s_all, markers),
        sec_terms(markers),
        sec_results(s1, ctx, markers),
        sec_featured(b1, s1, copy, markers),
        sec_batch2(b1, b2, s1, s2, s_all, ctx, copy, markers),
        sec_assess(s_all, s1, ctx, markers),
    ]
    batches = [(f"Batch 1 · Grup 1 — {s1['n']} runs · çalıştırma", b1)]
    if b2:
        batches.append((f"Batch 2 · Grup 2 — {s2['n']} runs · çalıştırma", b2))
    body.append(appendix(batches, copy, markers))
    body.append("</main>")
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>LIBRAIN — What it discovered, explained simply</title>'
            f'<style>{CSS}</style></head><body>{"".join(body)}</body></html>')


# --------------------------------------------------------------------------------------------
# PDF
# --------------------------------------------------------------------------------------------

def print_pdf(html_path, pdf_path):
    profile = tempfile.mkdtemp(prefix="librain-explainer-chrome-")
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
           f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
           "--disable-extensions", "--disable-background-networking", "--disable-component-update",
           "--disable-sync", "--disable-default-apps", "--metrics-recording-only", "--mute-audio",
           f"--print-to-pdf={pdf_path}", "file://" + html_path]
    try:
        subprocess.run(cmd, check=True, timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        # Stop anything still holding our private profile (never touches the user's own Chrome).
        subprocess.run(["pkill", "-f", profile], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        shutil.rmtree(profile, ignore_errors=True)


def locate(pdf_path):
    text = subprocess.run(["pdftotext", "-enc", "UTF-8", pdf_path, "-"], check=True,
                          capture_output=True, text=True).stdout
    pages = text.split("\f")
    found = {}
    for i, page in enumerate(pages, start=1):
        for m in re.finditer(r"@@([a-z0-9-]+)@@", page):
            found.setdefault(m.group(1), i)
    found["total"] = len([p for p in pages if p.strip()])
    return found


def main():
    ap = argparse.ArgumentParser(description="Build the bilingual LIBRAIN discoveries explainer.")
    ap.add_argument("--html-only", action="store_true", help="write the HTML only")
    ap.add_argument("--no-batch2", action="store_true", help="ignore batch 2 (preview the version-1 layout)")
    ap.add_argument("--out", default=OUT_PDF, help="PDF output path")
    args = ap.parse_args()

    b1 = load_batch(BATCH1)
    if b1 is None:
        sys.exit(f"missing experiments/{BATCH1}/runs")
    b2 = None if args.no_batch2 else load_batch(BATCH2)
    copy = read_json(COPY_FILE)
    ctx = load_context()
    built = datetime.date.today()

    for label, b in (("batch 1", b1), ("batch 2", b2)) + ((("all", merge_batches([b1, b2])),) if b2 else ()):
        if not b:
            print(f"{label}: not present (placeholder note)")
            continue
        s = batch_stats(b)
        print(f"{label}: {s['n']} runs, valid {s['valid']}, citations kept {s['kept']}/{s['claimed']}, dropped {s['dropped']}, "
              f"fabricated in output {s['fabricated_final']}, claim check ok {s['checked']}, no risky {s['no_risky']}, "
              f"plausibility>=0.6 {s['plaus_ok']}, featured {len(s['featured'])}, sentences {s['counts']}, "
              f"cost ${s['cost_total']:.2f} (mean ${s['cost_mean']:.4f})")

    if args.html_only:
        with open(OUT_HTML, "w", encoding="utf-8") as fh:
            fh.write(render(b1, b2, copy, ctx, built=built))
        print("wrote", OUT_HTML)
        return

    # Pass 1: invisible markers locate each section's page; pass 2 writes those page numbers in.
    with tempfile.TemporaryDirectory(prefix="librain-explainer-") as tmp:
        html1, pdf1 = os.path.join(tmp, "pass1.html"), os.path.join(tmp, "pass1.pdf")
        with open(html1, "w", encoding="utf-8") as fh:
            fh.write(render(b1, b2, copy, ctx, markers=True, built=built))
        print_pdf(html1, pdf1)
        pages = locate(pdf1)
    with open(OUT_HTML, "w", encoding="utf-8") as fh:
        fh.write(render(b1, b2, copy, ctx, pages=pages, built=built))
    print_pdf(OUT_HTML, args.out)
    print("wrote", OUT_HTML)
    print("wrote", args.out, f"({pages['total']} pages)", {k: v for k, v in pages.items() if k != "total"})


if __name__ == "__main__":
    main()
