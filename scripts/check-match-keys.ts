import {
  companyNameSimilarity,
  matchCompanyKey,
  softCompanyKey,
} from '../lib/arrearsMatchReview';

const pairs: Array<[string, string]> = [
  ['(주)팀코리아', '주식회사 팀코리아(광주)'],
  ['해림운수', '해림운수(하경일)'],
];
for (const [a, b] of pairs) {
  console.log(a, '↔', b);
  console.log('  soft ', softCompanyKey(a), '|', softCompanyKey(b));
  console.log('  match', matchCompanyKey(a), '|', matchCompanyKey(b), 'eq', matchCompanyKey(a) === matchCompanyKey(b));
  console.log('  sim  ', companyNameSimilarity(a, b));
}
