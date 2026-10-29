import { check, unprocessable } from '../utils/httpError.js';
import { mapBand, mapSettings } from '../utils/mappers.js';
import { validateGradingBands } from '../utils/evaluation.js';

export async function getSettings(db) {
  const { data } = check(await db.from('evaluation_settings').select('*').eq('id', 1).single());
  return mapSettings(data);
}

export async function updateSettings(db, body) {
  const { data } = check(
    await db
      .from('evaluation_settings')
      .update({
        coursework_max: body.courseworkMax,
        exam_max: body.examMax,
        default_pass_mark: body.defaultPassMark,
        lecturer_can_publish: body.lecturerCanPublish,
        lecturer_can_correct: body.lecturerCanCorrect,
      })
      .eq('id', 1)
      .select('*')
      .single(),
  );
  return mapSettings(data);
}

/** Returns the effective scale for a period (falls back to the default scale). */
export async function getBands(db, academicPeriodId = null) {
  if (academicPeriodId) {
    const { data } = check(
      await db.from('grading_scales').select('*').eq('academic_period_id', academicPeriodId).order('minimum_mark', { ascending: false }),
    );
    if (data.length) return { academicPeriodId, inherited: false, bands: data.map(mapBand) };
  }
  const { data } = check(
    await db.from('grading_scales').select('*').is('academic_period_id', null).order('minimum_mark', { ascending: false }),
  );
  return { academicPeriodId, inherited: Boolean(academicPeriodId), bands: data.map(mapBand) };
}

export async function replaceBands(db, { academicPeriodId, bands }) {
  const problem = validateGradingBands(bands);
  if (problem) throw unprocessable(problem);
  check(await db.rpc('replace_grading_scale', { p_period_id: academicPeriodId, p_bands: bands }));
  return getBands(db, academicPeriodId);
}
