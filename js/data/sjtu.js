/* 朱批书房 · 上海交通大学常用网站入口
 * 说明：均为外链，点击在新标签页打开；登录状态由浏览器自身保存，
 * 建议在交大统一认证页面勾选“记住我”或使用浏览器密码管理器。
 */
'use strict';

const SJTU_LINKS = {
  categories: [
    {
      id: 'jiaowu',
      name: '教务与办事',
      glyph: '教',
      note: '选课、成绩、证明、研究生事务',
      items: [
        { name: '交我办', url: 'https://my.sjtu.edu.cn/', glyph: '办', desc: '一站式网上办事大厅：成绩、课表、缴费、各类证明' },
        { name: '教务处', url: 'https://jwc.sjtu.edu.cn/', glyph: '教', desc: '教学通知、培养方案、考试安排与教学管理信息' },
        { name: '教学信息服务网', url: 'https://electsys.sjtu.edu.cn/', glyph: '选', desc: '选课、成绩查询、教学评价、毕业审核' },
        { name: '研究生院', url: 'https://gs.sjtu.edu.cn/', glyph: '研', desc: '研究生培养、学位申请与相关通知' }
      ]
    },
    {
      id: 'xuexi',
      name: '学习平台',
      glyph: '学',
      note: '课程、图书馆、数据库与网络服务',
      items: [
        { name: 'Canvas@SJTU', url: 'https://oc.sjtu.edu.cn/', glyph: '课', desc: '课程平台：课件、作业、讨论与测验' },
        { name: '图书馆', url: 'https://www.lib.sjtu.edu.cn/', glyph: '图', desc: '馆藏检索、电子数据库、文献传递与校外访问' },
        { name: '中国知网', url: 'https://www.cnki.net/', glyph: '知', desc: '学术文献检索；校外访问需经图书馆入口或校园 VPN' },
        { name: '网络信息中心', url: 'https://net.sjtu.edu.cn/', glyph: '网', desc: 'jAccount 账号、VPN、校园网与正版软件服务' }
      ]
    },
    {
      id: 'zixun',
      name: '校园资讯',
      glyph: '讯',
      note: '学校新闻、通知与校内社区',
      items: [
        { name: '上海交通大学主页', url: 'https://www.sjtu.edu.cn/', glyph: '校', desc: '学校概况、新闻动态与通知公告' },
        { name: '交大新闻网', url: 'https://news.sjtu.edu.cn/', glyph: '闻', desc: '校园新闻、人物报道与专题策划' },
        { name: '水源社区', url: 'https://shuiyuan.sjtu.edu.cn/', glyph: '源', desc: '校内交流社区，学习生活信息与讨论' }
      ]
    },
    {
      id: 'jiuye',
      name: '就业与升学',
      glyph: '业',
      note: '就业服务、招生信息与公考资讯',
      items: [
        { name: '学生就业服务和职业发展中心', url: 'https://job.sjtu.edu.cn/', glyph: '就', desc: '招聘信息、宣讲会与职业发展服务' },
        { name: '研究生招生网', url: 'https://yzb.sjtu.edu.cn/', glyph: '研', desc: '硕士、博士招生简章、复试与录取信息' },
        { name: '本科招生网', url: 'https://zsb.sjtu.edu.cn/', glyph: '本', desc: '本科招生政策、专业介绍与录取信息' },
        { name: '国家公务员局', url: 'https://www.scs.gov.cn/', glyph: '公', desc: '国考公告、职位表与考试录用信息' }
      ]
    }
  ]
};
