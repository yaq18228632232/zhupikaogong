/* 朱批书房 · 考公资源链接与时政源 */
'use strict';

const KAOGONG_LINKS = {
  categories: [
    {
      id: 'study',
      name: '备考学习',
      glyph: '学',
      note: '题库、课程、时政积累与申论素材',
      items: [
        { name: '粉笔', url: 'https://www.fenbi.com/', glyph: '粉', desc: '公务员题库、在线课程与模考' },
        { name: '华图教育', url: 'https://www.huatu.com/', glyph: '华', desc: '公考培训、历年真题与备考资料' },
        { name: '中公教育', url: 'https://www.offcn.com/', glyph: '中', desc: '公考资讯、课程与职位信息' },
        { name: '半月谈', url: 'http://www.banyuetan.org/', glyph: '半', desc: '时政评论、基层治理报道与申论素材' },
        { name: '学习强国', url: 'https://www.xuexi.cn/', glyph: '强', desc: '时政学习、理论文章与重要讲话' },
        { name: '求是网', url: 'https://www.qstheory.cn/', glyph: '求', desc: '《求是》文章与理论阐释' },
        { name: '人民网观点', url: 'https://opinion.people.com.cn/', glyph: '评', desc: '人民网评、观点频道，适合积累申论语言' },
        { name: '新华网时政', url: 'https://www.news.cn/politics/', glyph: '新', desc: '新华社时政新闻与权威报道' }
      ]
    },
    {
      id: 'exam',
      name: '考试信息',
      glyph: '考',
      note: '公告、职位表、报名与成绩发布',
      items: [
        { name: '国家公务员局', url: 'https://www.scs.gov.cn/', glyph: '国', desc: '国考公告、职位表、面试与录用公示' },
        { name: '国考报名系统', url: 'https://bm.scs.gov.cn/', glyph: '报', desc: '中央机关及其直属机构考录专题、报名入口' },
        { name: '上海市公务员局', url: 'https://shacs.gov.cn/', glyph: '沪', desc: '上海市考公告、职位简章与报名信息' },
        { name: '上海市人社局', url: 'https://rsj.sh.gov.cn/', glyph: '社', desc: '事业单位招聘、人事考试与政策发布' },
        { name: '中国人事考试网', url: 'http://www.cpta.com.cn/', glyph: '人', desc: '职业资格考试报名、成绩与证书查询' },
        { name: '人力资源和社会保障部', url: 'https://www.mohrss.gov.cn/', glyph: '部', desc: '就业、人事与社会保障政策' }
      ]
    },
    {
      id: 'news',
      name: '时政与评论',
      glyph: '闻',
      note: '权威时政、政策发布与评论文章',
      items: [
        { name: '中国政府网', url: 'https://www.gov.cn', glyph: '政', desc: '国务院政策文件、常务会议与政务信息' },
        { name: '人民网', url: 'https://www.people.com.cn', glyph: '民', desc: '时政新闻、评论与专题报道' },
        { name: '中国新闻网', url: 'https://www.chinanews.com.cn', glyph: '中', desc: '中新社即时新闻，时政、经济、社会全覆盖' },
        { name: '新华网', url: 'https://www.news.cn/', glyph: '华', desc: '国家通讯社新闻与权威发布' },
        { name: '央视网', url: 'https://www.cctv.com/', glyph: '央', desc: '新闻联播、焦点访谈与专题片' },
        { name: '澎湃新闻', url: 'https://www.thepaper.cn/', glyph: '湃', desc: '时政、社会与深度报道' },
        { name: '光明网', url: 'https://www.gmw.cn/', glyph: '光', desc: '时评、理论文章与文化报道' }
      ]
    }
  ]
};

/* 站内刷题页展示的在线题库入口（外链，不影响本站数据） */
const ONLINE_BANKS = [
  { name: '粉笔题库', url: 'https://www.fenbi.com/', glyph: '粉', desc: '分模块刷题、历年真题与在线模考（需登录）' },
  { name: '华图在线题库', url: 'https://v.huatu.com/tiku/', glyph: '华', desc: '行测分类练习、历年真题与模考大赛' },
  { name: '中公题库', url: 'https://tiku.offcn.com/', glyph: '中', desc: '公职考试题库，按考试类型分类练习' },
  { name: '半月谈', url: 'http://www.banyuetan.org/', glyph: '半', desc: '时政热点、每日时政测验与申论素材' }
];

/* 时政 RSS 源
 *
 * 每个源有两个地址，别混用：
 *   url  —— RSS 订阅地址，程序抓取新闻用（返回 XML，人不看）
 *   home —— 官方网站首页，页面底部「官方来源」卡片跳转用
 * 以前两者用同一个字段，导致点「官方来源」打开的是一堆 XML 源码。
 *
 * 若某个源失效，可在「时政热点」页手动刷新查看错误信息，或替换此处的 url。 */
const NEWS_SOURCES = [
  {
    id: 'chinanews',
    name: '中新网 · 即时新闻',
    tag: '综合',
    url: 'https://www.chinanews.com.cn/rss/scroll-news.xml',
    home: 'https://www.chinanews.com.cn'
  },
  {
    id: 'gov',
    name: '中国政府网 · 政策发布',
    tag: '政策',
    url: 'https://www.gov.cn/pushinfo/v150203/rss.xml',
    home: 'https://www.gov.cn'
  }
];
