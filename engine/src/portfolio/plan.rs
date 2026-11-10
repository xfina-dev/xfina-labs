//! The investment plan: a lumpsum, then a share of take-home pay every month.
//!
//! A port of `src/portfolio-engine/plan.js`, field for field and curve for
//! curve, because the page shows the plan and the engine spends it: if the two
//! disagreed about what "S-curve" means, the summary above the Run button would
//! describe a plan that was never run.

use crate::portfolio::model::PlanRequest;

/// How a value travels from its start to its end.
fn along(curve: &str, a: f64, b: f64, x: f64) -> f64 {
    match curve {
        "Linear" => a + (b - a) * x,
        "Fast early" => a + (b - a) * (1.0 - (1.0 - x) * (1.0 - x)),
        "Fast late" => a + (b - a) * x * x,
        "S-curve" => a + (b - a) * (x * x * (3.0 - 2.0 * x)),
        // Compound is the salary's natural curve, and the default.
        _ => {
            if a > 0.0 && b > 0.0 {
                a * (b / a).powf(x)
            } else {
                a + (b - a) * x
            }
        }
    }
}

/// One contribution year: the year's salary, the savings rate, and what goes in
/// each month of it.
#[derive(Debug, Clone, Copy)]
pub struct PlanYear {
    pub salary_year: f64,
    pub rate: f64,
    pub monthly: f64,
}

pub struct Plan {
    pub years: Vec<PlanYear>,
    pub lumpsum: f64,
    pub months: usize,
    /// The salary the last contribution year reaches.
    pub salary_end: f64,
    pub salary_growth: f64,
}

impl Plan {
    pub fn build(p: &PlanRequest, months: usize) -> Plan {
        let year_count = ((months as f64 / 12.0).ceil() as usize).max(1);
        let steps = year_count.saturating_sub(1) as f64;
        let start = p.salary_start;
        // One of the two is entered and the other follows from it, exactly as
        // the Plan Investments step does it.
        let (salary_end, growth) = if p.salary_by.as_deref() == Some("Ending") {
            let end = p.salary_end;
            let g = if steps > 0.0 && start > 0.0 && end > 0.0 {
                (end / start).powf(1.0 / steps) - 1.0
            } else {
                0.0
            };
            (end, g)
        } else {
            let g = p.salary_growth / 100.0;
            (start * (1.0 + g).powf(steps), g)
        };
        let curve = p.salary_curve.as_deref().unwrap_or("Compound");
        let rate_curve = p.rate_curve.as_deref().unwrap_or("S-curve");
        let tax = (p.tax_rate / 100.0).clamp(0.0, 1.0);
        let years = (0..year_count)
            .map(|y| {
                let x = if year_count > 1 {
                    y as f64 / (year_count - 1) as f64
                } else {
                    0.0
                };
                let salary_year = along(curve, start, salary_end, x);
                let salary = salary_year / 12.0;
                let rate = along(rate_curve, p.rate_start, p.rate_end, x) / 100.0;
                PlanYear {
                    salary_year,
                    rate,
                    monthly: (salary - salary * tax) * rate,
                }
            })
            .collect();
        Plan {
            years,
            lumpsum: p.lumpsum,
            months,
            salary_end,
            salary_growth: growth,
        }
    }

    /// What goes in `m` months after the first contribution: the lumpsum with
    /// the first instalment, then that year's monthly investment.
    pub fn contribution(&self, m: usize) -> f64 {
        if m >= self.months {
            return 0.0;
        }
        let year = self.years[(m / 12).min(self.years.len() - 1)];
        (if m == 0 { self.lumpsum } else { 0.0 }) + year.monthly
    }
}
