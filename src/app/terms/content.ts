// The Terms and Conditions text, transcribed from the signed-off terms-en.pdf and
// terms-ar.pdf (November 2026). Two agreements — Host and Guest — each split into
// headed groups of numbered articles. The Arabic text governs (Article 21 / 16),
// so when wording changes, change both languages from the lawyer's copy, never by
// translating one from the other.

/** A paragraph, a numbered clause ("2.1"), or a lettered list. */
export type Block = string | { n: string; text: string } | { list: string[] }

export type Article = { title: string; body: Block[] }

export type Agreement = {
  id: 'host' | 'guest'
  title: string
  subtitle: string
  groups: { heading: string; articles: Article[] }[]
}

export type Terms = {
  title: string
  lastUpdatedLabel: string
  lastUpdated: string
  intro: string[]
  agreements: [Agreement, Agreement]
}

export const termsEn: Terms = {
  title: 'Terms and Conditions',
  lastUpdatedLabel: 'Last updated',
  lastUpdated: '13 November 2026',
  intro: [
    'These Terms and Conditions consist of two agreements: one governing the relationship between the Company and Hosts (property owners / lessors), and one governing the relationship between the Company and Guests (lessees). Please read the agreement that applies to you.',
    'In the event of any conflict between the Arabic and English versions, the Arabic version prevails.',
  ],
  agreements: [
    {
      id: 'host',
      title: 'Host Terms',
      subtitle: 'For property owners and lessors listing on the Platform',
      groups: [
        {
          heading: 'General provisions governing the relationship between the Company and the Host',
          articles: [
            {
              title: 'Article 1 – Scope of the Relationship',
              body: [
                'The Host acknowledges and agrees that this Agreement governs the legal relationship between the Host and the Company with respect to the use of the electronic Platform, the listing of Properties, the management of Booking requests, payments, and related services, in accordance with the terms and conditions set forth in this Agreement or in any Annex attached to this Agreement.',
              ],
            },
            {
              title: 'Article 2 – Role of the Company',
              body: [
                { n: '2.1', text: 'The Company acts as the operator and developer of an electronic Platform specialized in displaying Properties, facilitating Booking transactions, and managing payments between Hosts and Guests.' },
                { n: '2.2', text: 'The Company is not the owner, lessor or lessee of any Property displayed through the Platform, nor does it manage, operate, or directly supervise any such Property.' },
                { n: '2.3', text: 'The Company is not a party to any lease, usufruct, accommodation, or any other agreement entered into between the Host and the Guest. All rights and obligations arising from such agreement shall arise directly between the Host and the Guest.' },
              ],
            },
            {
              title: 'Article 3 – Independence of the Legal Relationship Between the Parties',
              body: [
                { n: '3.1', text: 'The Host shall remain legally, financially, and administratively independent from the Company and shall bear sole responsibility for the Property listed by the Host and for all related data, information, and services.' },
                { n: '3.2', text: 'This Agreement shall not create any form of partnership, joint venture, employment relationship, franchise relationship, administrative dependency, or financial dependency between the Company and the Host. Each party shall retain its independent legal personality and separate responsibility from the other party.' },
                { n: '3.3', text: 'This Agreement does not grant either party the status of agent, representative, or authorized delegate of the other party. Neither party may enter into contracts, create obligations, provide undertakings, or make representations on behalf of the other party except to the extent expressly provided in this Agreement.' },
                { n: '3.4', text: 'The Host shall not present, advertise, or act in any manner suggesting that the Host is a representative, agent, or authorized delegate of the Company, or authorized to contract or undertake obligations on its behalf before third parties.' },
              ],
            },
            {
              title: 'Article 4 – Nature of the Platform Services',
              body: [
                'The Host acknowledges that the Company’s services are limited to operating the electronic Platform and providing related technical and administrative services, including:',
                {
                  list: [
                    '(a) Displaying Properties on the Platform;',
                    '(b) Receiving and managing Booking requests;',
                    '(c) Processing payments collected through the Platform;',
                    '(d) Holding collected amounts and transferring financial entitlements in accordance with the Platform Policies;',
                    '(e) Providing communication channels and technical support.',
                  ],
                },
              ],
            },
            {
              title: 'Article 5 – Host Responsibility for the Property and Data',
              body: [
                { n: '5.1', text: 'The Host acknowledges that the Company does not own the Properties displayed on the Platform and does not manage, operate, or directly supervise them. The Company’s role is limited to operating the electronic Platform and providing related services in accordance with this Agreement.' },
                { n: '5.2', text: 'The Host shall bear sole responsibility for all obligations and liabilities relating to the Property listed by the Host, including its condition, suitability for use, quality of services provided through it, and its conformity with the description, images, and information published on the Platform.' },
                { n: '5.3', text: 'The Host shall also bear sole responsibility for all legal, regulatory, technical, tax, and contractual obligations relating to the Property or its use or rental, without any liability on the Company, unless otherwise expressly required by law.' },
                { n: '5.4', text: 'The Company shall not bear any liability arising from the inaccuracy, incorrectness, incompleteness, or insufficiency of any data, information, documents, or descriptions provided by the Host or published through the Host’s Account on the Platform.' },
              ],
            },
            {
              title: 'Article 6 – Company Right to Manage and Develop the Platform',
              body: [
                { n: '6.1', text: 'The Company reserves the right to organize, manage, operate, and develop the Platform and to adopt any policies and operational procedures it deems appropriate to ensure operational integrity, protect users, and achieve its legitimate interests, in accordance with this Agreement and applicable laws.' },
                { n: '6.2', text: 'The Company may, at any time, amend, develop, or update the Platform’s operational mechanisms and procedures, Booking systems, payment systems, Property display methods, data verification processes, or any other services or operational Policies whenever business interests so require.' },
                'The Company shall not affect rights or obligations arising from confirmed Bookings made prior to the effective date of such amendments unless the amendment is required to comply with applicable law, a decision issued by a competent authority, or to address a material technical or security issue.',
              ],
            },
            {
              title: 'Article 7 – Company Right of Verification',
              body: [
                { n: '7.1', text: 'The Company may, at any time, request any documents, data, or information it deems necessary to verify the Host’s identity, the accuracy of Property-related information, and the Host’s right to list or rent the Property. The Company may also request periodic updates of such documents whenever necessary.' },
                { n: '7.2', text: 'The Host shall fully cooperate with the Company and provide the requested documents within the specified period. Failure or delay in providing such documents shall entitle the Company to suspend, restrict, or remove the Property or the Account without incurring any liability.' },
                { n: '7.3', text: 'The Company may use governmental or private entities, systems, databases, or any technological means it deems appropriate to verify the accuracy of the data and documents provided by the Host.' },
              ],
            },
            {
              title: 'Article 8 – Company Right to Accept, Reject, Suspend, or Remove Properties',
              body: [
                'The Company reserves its discretionary right, as it deems necessary to protect its legitimate interests, to accept, reject, suspend, or remove any Property, as well as any related content or information, whenever it determines that such action is necessary to protect the Platform, users, its interests, or to comply with applicable laws or internal Policies.',
                'The exercise of this right shall not create any obligation on the Company to compensate the Host or disclose the reasons for its decision unless otherwise required by law.',
              ],
            },
            {
              title: 'Article 9 – Limitation of Company Liability Regarding Financial Consideration',
              body: [
                'The Host acknowledges that the Company’s role is limited to providing and operating the electronic Platform and that the Company does not guarantee any minimum number of Bookings. The Company also does not guarantee the collection or payment of any amounts agreed between the Host and the Guest except to the extent of amounts actually collected through the Platform. The Company shall not bear any liability for decreased demand, reduced Bookings, market changes, competition, or any other factors beyond its control.',
              ],
            },
            {
              title: 'Article 10 – Company Right to Suspend Financial Transfers',
              body: [
                'The Company may temporarily suspend or delay the transfer of any amounts due to the Host in the event of a serious complaint or dispute relating to a Booking or the Property involved, or where there is suspicion of a violation of this Agreement or applicable laws, until the review is completed, the dispute is resolved, or the matter under complaint is verified. No liability shall arise on the Company as a result. Any decision taken by the Company in this regard shall be temporary and shall not constitute acknowledgment of the validity of any claim or dispute under review.',
              ],
            },
          ],
        },
        {
          heading: 'Host obligations',
          articles: [
            {
              title: 'Article 11 – Obligation to Provide Accurate Data and Documents',
              body: [
                { n: '11.1', text: 'The Host shall provide accurate, correct, and complete data, information, and documents upon registration or when listing any Property on the Platform.' },
                { n: '11.2', text: 'The Host warrants the accuracy of all data, information, documents, and images provided by the Host and shall bear sole legal responsibility for any inaccurate, misleading, or incomplete information.' },
                { n: '11.3', text: 'The Host shall immediately notify the Company upon becoming aware of any error in, or change to, any data, documents, or information previously provided.' },
              ],
            },
            {
              title: 'Article 12 – Obligation to Update Property Information',
              body: [
                { n: '12.1', text: 'The Host shall continuously maintain updated information regarding the Property listed on the Platform.' },
                { n: '12.2', text: 'The Host shall promptly update any material information relating to the Property, including prices, specifications, services, Property status, or any information that may affect a Booking decision.' },
                { n: '12.3', text: 'The Host shall bear sole responsibility for any damages or claims arising from failure to update Property-related information.' },
              ],
            },
            {
              title: 'Article 13 – Obligation Regarding the Right to Rent or Manage',
              body: [
                { n: '13.1', text: 'The Host shall be the owner of the Property or legally authorized to manage, rent, or list it through the Platform.' },
                { n: '13.2', text: 'The Host shall retain documents evidencing the right to list and rent the Property throughout the period of use of the Platform.' },
                { n: '13.3', text: 'The Host shall bear all legal consequences arising from the absence of the legal right required to list or rent the Property.' },
              ],
            },
            {
              title: 'Article 14 – Obligation to Respond to Booking Requests',
              body: [
                { n: '14.1', text: 'The Host shall review and respond to Booking requests received through the Platform within no more than twenty-four (24) hours from receipt of the request.' },
                { n: '14.2', text: 'The Company may deem a Booking request automatically rejected or cancelled if the above period expires without a response from the Host.' },
                { n: '14.3', text: 'The Company shall bear no liability toward the Host or the Guest resulting from cancellation of a Booking request due to failure to respond within the specified period.' },
              ],
            },
            {
              title: 'Article 15 – Obligation to Fulfill Confirmed Bookings',
              body: [
                { n: '15.1', text: 'The Host shall fulfill all Bookings confirmed in accordance with the procedures and Policies applicable on the Platform.' },
                { n: '15.2', text: 'The Host may cancel a confirmed Booking in accordance with the Policies approved by the Company, while bearing all consequences arising therefrom under this Agreement.' },
                { n: '15.3', text: 'The Host shall immediately notify the Company upon becoming aware of any circumstance that may affect the Host’s ability to fulfill a Booking or perform obligations toward the Guest.' },
                { n: '15.4', text: 'Cancellation of a Booking by the Host shall not prejudice the Company’s right to take any measures or penalties it deems appropriate under this Agreement.' },
              ],
            },
            {
              title: 'Article 16 – Obligation Regarding the Accuracy of Financial Consideration Displayed on the Platform',
              body: [
                { n: '16.1', text: 'The Host shall list the actual rental value and all amounts payable by the Guest accurately and completely.' },
                { n: '16.2', text: 'The Host is prohibited from providing, recording, or advertising any fictitious or inaccurate value, concealing any part of the financial consideration, or entering into any arrangements intended to circumvent, reduce, or avoid the Company’s fees or commissions, whether directly or indirectly.' },
                { n: '16.3', text: 'If such violation is established, the Company may recalculate the applicable fees and commissions based on the actual value of the transaction, without prejudice to its right to impose penalties or claim compensation under this Agreement.' },
              ],
            },
          ],
        },
        {
          heading: 'Contractual penalties and liability',
          articles: [
            {
              title: 'Article 17 – Contractual Penalties',
              body: [
                'In the event the Host breaches any provision, obligation, undertaking, or warranty contained in this Agreement or any related Policies or Annexes, the Company may take any measures or penalties it deems appropriate depending on the severity of the violation, including warning notices, suspension of the Property, suspension of the Account, restriction of certain services, or termination of the Agreement, without prejudice to any other rights available to the Company under applicable law or this Agreement. The Company shall determine the appropriate measure according to the nature and seriousness of the violation, provided that such measure does not conflict with applicable law.',
              ],
            },
            {
              title: 'Article 18 – Agreed Compensation',
              body: [
                'If the Host breaches any provision, obligation, undertaking, or warranty contained in this Agreement or any related Policies or Annexes, and such breach causes harm to the Company, the Platform, users, or the Company’s legitimate interests, the Host shall pay agreed compensation equal to the total actual rental value of the Booking or transaction subject to the violation, without prejudice to the Company’s right to impose any other penalties or measures available under this Agreement or applicable law, or to claim compensation for damages exceeding the value of the agreed compensation.',
              ],
            },
          ],
        },
        {
          heading: 'Final provisions',
          articles: [
            {
              title: 'Article 19 – Electronic Acceptance',
              body: [
                'The Host acknowledges that completing registration procedures, creating an Account, using the Platform, clicking “Agree,” or using any similar electronic acceptance mechanism constitutes explicit and binding acceptance of all provisions of this Agreement and the related Policies and Annexes and shall produce all legal effects prescribed by law.',
              ],
            },
            {
              title: 'Article 20 – Electronic Records and Evidence',
              body: [
                'The parties agree that electronic records, data, messages, notifications, and transaction logs maintained by the Company or generated through the Platform shall constitute valid evidence of Platform usage and all transactions, procedures, and actions carried out through the Host’s Account unless proven otherwise through legally recognized means.',
              ],
            },
            {
              title: 'Article 21 – Governing Language',
              body: [
                'This Agreement has been executed in both Arabic and English. In the event of any conflict, discrepancy, or inconsistency between the two versions, the Arabic version shall prevail and shall be regarded as the governing text for interpretation and application.',
              ],
            },
            {
              title: 'Article 22 – Governing Law',
              body: [
                'This Agreement and all related Policies and Annexes shall be governed, interpreted, enforced, and given legal effect in accordance with the laws in force in the Arab Republic of Egypt.',
              ],
            },
            {
              title: 'Article 23 – Jurisdiction',
              body: [
                'The courts of the Arab Republic of Egypt shall have jurisdiction over any dispute, claim, or disagreement arising out of or relating to this Agreement, its implementation, or its interpretation. Jurisdiction shall be vested in the court having subject-matter and territorial jurisdiction in accordance with applicable legal rules.',
              ],
            },
            {
              title: 'Article 24 – Force Majeure',
              body: [
                'Each party shall perform its obligations in accordance with this Agreement. Neither party shall be liable for non-performance or delay in performance where such non-performance or delay results from a cause beyond its control that could not be foreseen, prevented, or avoided, for the duration of such circumstances and to the extent of their effects.',
              ],
            },
            {
              title: 'Article 25 – Severability',
              body: [
                'If any provision of this Agreement is determined to be wholly or partially invalid, unlawful, or unenforceable, such determination shall not affect the validity or enforceability of the remaining provisions, which shall remain in full force and effect to the extent they do not conflict with the provision determined to be invalid or unenforceable.',
              ],
            },
            {
              title: 'Article 26 – Assignment of the Agreement',
              body: [
                'The Host may not assign this Agreement or any rights or obligations arising from it, in whole or in part, to any person or entity without obtaining the Company’s prior written consent.',
                'Nothing in the foregoing shall prejudice the Company’s right to transfer, assign, or reorganize its rights or obligations relating to the Platform or its business activities to the extent permitted by applicable laws.',
              ],
            },
            {
              title: 'Article 27 – Policies and Annexes',
              body: [
                'All Policies, Annexes, forms, instructions, and operational procedures adopted by the Company, published on the Platform, or incorporated by reference into this Agreement shall constitute an integral part of this Agreement and shall supplement its provisions. The Host shall review and comply with all such Policies, Annexes, forms, instructions, and operational procedures.',
                'The Company may amend or update such Policies or Annexes whenever required by the operation of the Platform or by legal, regulatory, or technical requirements. Such amendments or updates shall become effective from the date of their publication on the Platform or from such later date as may be specified by the Company, without prejudice to any rights or obligations that arose prior to their effective date, unless otherwise required by applicable law.',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'guest',
      title: 'Guest Terms',
      subtitle: 'For guests making Bookings through the Platform',
      groups: [
        {
          heading: 'General provisions governing the relationship between the Company and the Guest',
          articles: [
            {
              title: 'Article 1 – Scope of the Relationship',
              body: [
                'This Agreement governs the relationship between the Guest and the Company with respect to the use of the Platform, making Bookings, and benefiting from the services provided through it, in accordance with the provisions of this Agreement and the Policies and Annexes associated therewith.',
              ],
            },
            {
              title: 'Article 2 – Role of the Company',
              body: [
                { n: '2.1', text: 'The Company acts as the operator and developer of an electronic Platform specialized in displaying Properties, facilitating Booking transactions, and managing payments between Hosts and Guests.' },
                { n: '2.2', text: 'The Company is not the owner, Host, or Guest of any of the Properties displayed through the Platform, nor does it undertake their management, operation, or direct supervision.' },
                { n: '2.3', text: 'The Company is not a party to any lease, usufruct, accommodation, or any agreement entered into between the Host and the Guest. All rights and obligations arising from such agreement shall arise directly between the Host and the Guest.' },
              ],
            },
            {
              title: 'Article 3 – Limitation of the Company’s Liability',
              body: [
                'The Guest acknowledges that the Company’s role is limited to operating the electronic Platform and providing the services associated therewith, and that the Company shall bear no liability for the Property, its condition, its suitability, its conformity with its description, the performance by the Host of the Host’s obligations, or any dispute arising between the Host and the Guest, unless the law expressly provides otherwise.',
              ],
            },
          ],
        },
        {
          heading: 'Guest obligations',
          articles: [
            {
              title: 'Article 4 – Obligation to Provide Accurate Information',
              body: [
                { n: '4.1', text: 'The Guest shall provide correct, accurate, and complete data and information when creating an Account, using the Platform, or making any Booking.' },
                { n: '4.2', text: 'The Guest shall update the Guest’s information whenever any material change occurs.' },
                { n: '4.3', text: 'The Guest alone shall bear full legal responsibility for any incorrect, misleading, or incomplete data or information submitted through the Platform.' },
              ],
            },
            {
              title: 'Article 5 – Obligation to Comply with Booking Terms',
              body: [
                { n: '5.1', text: 'The Guest shall review the Property information, the Booking terms, and the financial consideration before completing the Booking.' },
                { n: '5.2', text: 'The Guest shall pay all amounts due in accordance with the procedures and Policies applicable on the Platform.' },
                { n: '5.3', text: 'The Guest shall perform all obligations arising from a confirmed Booking in accordance with the provisions of this Agreement and the associated Policies.' },
              ],
            },
            {
              title: 'Article 6 – Obligation to Use the Platform Lawfully',
              body: [
                { n: '6.1', text: 'The Guest shall use the Platform lawfully and in a manner that does not violate applicable laws, public morals, or the rights of others.' },
                { n: '6.2', text: 'The Guest shall not use the Platform for any unlawful purpose or submit any data or content that may cause harm to the Company, the Platform, or other users.' },
              ],
            },
            {
              title: 'Article 7 – Obligation to Comply with the Law',
              body: [
                'The Guest shall use the Platform and the Property in compliance with the applicable laws, regulations, and decisions, and shall refrain from using the Property for any unlawful activity or any activity contrary to public order or public morals. The Guest alone shall bear all legal consequences arising from any violation thereof.',
              ],
            },
            {
              title: 'Article 8 – Obligation to Comply with the Property Rules',
              body: [
                'The Guest shall review the rules, instructions, and conditions applicable to the Property, as announced or provided by the Host or through the Platform, before or during the Booking, and shall comply therewith throughout the Booking period, without prejudice to the provisions of the law or this Agreement.',
              ],
            },
            {
              title: 'Article 9 – Obligation Not to Circumvent the Platform',
              body: [
                { n: '9.1', text: 'The Guest shall not circumvent the Platform or the Booking systems, payment systems, fees, or commissions applied through the Platform, whether directly or indirectly.' },
                { n: '9.2', text: 'The Guest shall also not use the Platform to identify a Host and thereafter complete, or attempt to complete, a Booking, enter into a contract, or make payment outside the Platform for the purpose of avoiding the applicable fees, commissions, or Policies.' },
              ],
            },
            {
              title: 'Article 10 – Obligation to Notify of Problems or Disputes',
              body: [
                'The Guest shall notify the Company within a reasonable period of any problem, complaint, or dispute relating to a Booking or the use of the Platform immediately upon becoming aware thereof, in accordance with the procedures applicable on the Platform.',
              ],
            },
          ],
        },
        {
          heading: 'Contractual penalties and liability',
          articles: [
            {
              title: 'Article 11 – Contractual Penalties',
              body: [
                'In the event the Guest breaches any provision or obligation contained in this Agreement or any related Policies or Annexes, the Company may take any measures or penalties it deems appropriate according to the nature of the violation, including issuing a warning, a formal notice, suspension of the Booking, suspension of the Account, restriction of certain services, or termination of the Account, without prejudice to any other rights available to the Company under applicable law or this Agreement.',
              ],
            },
            {
              title: 'Article 12 – Liability and Indemnification',
              body: [
                'The Guest shall indemnify the Company for any damages, losses, or direct expenses arising from the Guest’s breach of the provisions of this Agreement or the related Policies or Annexes, without prejudice to the Company’s right to take any other measures or penalties available under this Agreement or the law.',
              ],
            },
            {
              title: 'Article 13 – Booking Cancellation and Refunds',
              body: [
                'Booking cancellations and refunds shall be subject to the cancellation and refund Policies in effect on the Platform at the time the Booking is made. The Guest acknowledges acceptance of such Policies upon completing the Booking.',
                'When processing cancellation or refund requests, the Company may deduct or retain fees, commissions, or non-refundable amounts in accordance with the Platform Policies applicable to the Booking being cancelled, without prejudice to any other rights or obligations established under this Agreement or the law.',
              ],
            },
          ],
        },
        {
          heading: 'Final provisions',
          articles: [
            {
              title: 'Article 14 – Electronic Acceptance',
              body: [
                'The Guest acknowledges that completing registration procedures, creating an Account, using the Platform, clicking “Agree,” or using any similar electronic acceptance mechanism constitutes explicit and binding acceptance of all provisions of this Agreement and the related Policies and Annexes and shall produce all legal effects prescribed by law.',
              ],
            },
            {
              title: 'Article 15 – Electronic Records and Evidence',
              body: [
                'The parties agree that electronic records, data, messages, notifications, and transaction logs maintained by the Company or generated through the Platform shall constitute valid evidence of Platform usage and all transactions, procedures, and actions carried out through the Guest’s Account unless proven otherwise through legally recognized means.',
              ],
            },
            {
              title: 'Article 16 – Governing Language',
              body: [
                'This Agreement has been executed in both Arabic and English. In the event of any conflict, discrepancy, or inconsistency between the two versions, the Arabic version shall prevail and shall be regarded as the governing text for interpretation and application.',
              ],
            },
          ],
        },
      ],
    },
  ],
}

export const termsAr: Terms = {
  title: 'الشروط والأحكام',
  lastUpdatedLabel: 'آخر تحديث',
  lastUpdated: '١٣ نوفمبر ٢٠٢٦',
  intro: [
    'تتكون هذه الشروط والأحكام من اتفاقيتين: الأولى تنظم العلاقة بين الشركة والمؤجرين (ملاك الوحدات)، والثانية تنظم العلاقة بين الشركة والمستأجرين. يرجى قراءة الاتفاقية التي تنطبق عليك.',
    'في حال وجود أي تعارض بين النسختين العربية والإنجليزية، يُعتد بالنص العربي.',
  ],
  agreements: [
    {
      id: 'host',
      title: 'شروط المؤجر',
      subtitle: 'للملاك والمؤجرين الذين يعرضون وحداتهم على المنصة',
      groups: [
        {
          heading: 'الأحكام العامة المنظمة للعلاقة بين الشركة والمؤجر',
          articles: [
            {
              title: 'المادة (١) – نطاق العلاقة',
              body: [
                'يقر المؤجر ويوافق على أن هذه الاتفاقية تنظم العلاقة القانونية بينه وبين الشركة فيما يتعلق باستخدام المنصة الإلكترونية وإدراج الوحدات العقارية وإدارة طلبات الحجز والمدفوعات والخدمات المرتبطة بها، وذلك وفقًا للشروط والأحكام الواردة في هذه الاتفاقية أو في أي ملحق تابع لهذا الاتفاق.',
              ],
            },
            {
              title: 'المادة (٢) – دور الشركة',
              body: [
                { n: '٢.١', text: 'تعمل الشركة بصفتها مشغلًا ومطورًا لمنصة إلكترونية متخصصة في عرض الوحدات العقارية وتسهيل عمليات الحجز وإدارة المدفوعات بين المؤجرين والعملاء.' },
                { n: '٢.٢', text: 'لا تعد الشركة مالكة أو مؤجرة أو مستأجرة لأي من الوحدات العقارية المعروضة عبر المنصة، كما لا تتولى إدارتها أو تشغيلها أو الإشراف المباشر عليها.' },
                { n: '٢.٣', text: 'لا تعد الشركة طرفًا في أي عقد إيجار، أو انتفاع، أو إقامة، أو أي اتفاق يتم بين المؤجر والعميل، وتنشأ كافة الحقوق والالتزامات الناشئة عن ذلك العقد مباشرة بين المؤجر والعميل.' },
              ],
            },
            {
              title: 'المادة (٣) – استقلال العلاقة القانونية بين الطرفين',
              body: [
                { n: '٣.١', text: 'يظل المؤجر شخصًا مستقلًا قانونًا وماليًا وإداريًا عن الشركة، ويتحمل وحده المسؤولية الكاملة عن الوحدة العقارية المدرجة من قبله وكافة البيانات والمعلومات والخدمات المرتبطة بها.' },
                { n: '٣.٢', text: 'لا يترتب على هذه الاتفاقية إنشاء أي شكل من أشكال الشراكة، أو المشروع المشترك، أو علاقة العمل، أو الامتياز التجاري، أو التبعية الإدارية، أو المالية بين الشركة والمؤجر، ويحتفظ كل طرف بشخصيته القانونية المستقلة ومسؤوليته المنفصلة عن الطرف الآخر.' },
                { n: '٣.٣', text: 'لا تمنح هذه الاتفاقية لأي من الطرفين صفة الوكيل أو الممثل أو المفوض عن الطرف الآخر، ولا يجوز لأي منهما التعاقد، أو ترتيب التزامات، أو تقديم تعهدات، أو إقرارات باسم الطرف الآخر إلا في الحدود التي تنص عليها هذه الاتفاقية صراحة.' },
                { n: '٣.٤', text: 'يلتزم المؤجر بعدم تقديم نفسه أو الإعلان أو التصرف بأي صورة توحي بأنه ممثل أو وكيل أو مفوض من قبل الشركة أو مخول بالتعاقد أو الالتزام باسمها أمام الغير.' },
              ],
            },
            {
              title: 'المادة (٤) – طبيعة خدمات المنصة',
              body: [
                'يقر المؤجر علمه بأن خدمات الشركة تقتصر على تشغيل المنصة الإلكترونية وما يرتبط بها من خدمات تقنية وإدارية، بما في ذلك:',
                {
                  list: [
                    '(أ) عرض الوحدات العقارية على المنصة.',
                    '(ب) استقبال وإدارة طلبات الحجز.',
                    '(ت) معالجة المدفوعات المحصلة عبر المنصة.',
                    '(ث) الاحتفاظ بالمبالغ المحصلة وتحويل المستحقات المالية وفقًا لسياسات المنصة.',
                    '(ج) توفير وسائل التواصل والدعم الفني.',
                  ],
                },
              ],
            },
            {
              title: 'المادة (٥) – مسؤولية المؤجر عن الوحدة والبيانات',
              body: [
                { n: '٥.١', text: 'يقر المؤجر بأن الشركة لا تملك الوحدات العقارية المعروضة على المنصة، ولا تتولى إدارتها أو تشغيلها أو الإشراف المباشر عليها، ويقتصر دورها على تشغيل المنصة الإلكترونية وتقديم الخدمات المرتبطة بها وفقًا لأحكام هذه الاتفاقية.' },
                { n: '٥.٢', text: 'يتحمل المؤجر وحده كافة المسؤوليات والالتزامات المتعلقة بالوحدة العقارية المدرجة من قبله، بما في ذلك حالتها وصلاحيتها للاستخدام وجودة الخدمات المقدمة من خلالها ومدى مطابقتها للوصف والصور والبيانات المنشورة على المنصة.' },
                { n: '٥.٣', text: 'كما يتحمل المؤجر وحده جميع الالتزامات القانونية والتنظيمية والفنية والضريبية والتعاقدية المتعلقة بالوحدة أو باستغلالها أو تأجيرها، دون أدنى مسؤولية على الشركة، وذلك ما لم ينص القانون صراحة على خلاف ذلك.' },
                { n: '٥.٤', text: 'ولا تتحمل الشركة أي مسؤولية ناشئة عن عدم صحة، أو دقة، أو اكتمال، البيانات، أو المعلومات، أو المستندات، أو الأوصاف المقدمة من المؤجر أو المنشورة بواسطة حسابه على المنصة.' },
              ],
            },
            {
              title: 'المادة (٦) – حق الشركة في إدارة وتطوير المنصة',
              body: [
                { n: '٦.١', text: 'تحتفظ الشركة بحقها في تنظيم وإدارة وتشغيل المنصة وتطويرها واتخاذ ما تراه مناسبًا من سياسات وإجراءات تشغيلية لضمان سلامة التشغيل وحماية المستخدمين وتحقيق مصالحها المشروعة، وذلك وفقًا لأحكام هذه الاتفاقية والقوانين المعمول بها.' },
                { n: '٦.٢', text: 'يحق للشركة في أي وقت تعديل أو تطوير أو تحديث آليات وإجراءات تشغيل المنصة، أو أنظمة الحجز، أو المدفوعات، أو عرض الوحدات، أو التحقق من البيانات، أو أي خدمات أو سياسات تشغيلية أخرى كلما اقتضت مصلحة العمل ذلك.' },
                'على أن تلتزم الشركة بعدم المساس بالحقوق أو الالتزامات الناشئة عن الحجوزات المؤكدة قبل تاريخ نفاذ تلك التعديلات، ما لم يكن التعديل لازمًا للامتثال لأحكام القانون أو لقرار صادر من جهة مختصة أو لمعالجة خلل تقني أو أمني جوهري.',
              ],
            },
            {
              title: 'المادة (٧) – حق الشركة في التحقق',
              body: [
                { n: '٧.١', text: 'يحق للشركة، في أي وقت، أن تطلب من المؤجر ما تراه لازمًا من مستندات أو بيانات أو معلومات للتحقق من هويته، وصحة البيانات المتعلقة بالوحدة، وأحقيته في عرضها أو تأجيرها. كما يحق لها أن تطلب تحديث هذه المستندات دوريًا أو كلما دعت الحاجة إلى ذلك.' },
                { n: '٧.٢', text: 'يلتزم المؤجر بالتعاون الكامل مع الشركة وتقديم المستندات المطلوبة خلال المدة التي تحددها. ويترتب على امتناعه أو تأخره في تقديمها حق الشركة في تعليق الوحدة، أو الحساب، أو تقييدهما، أو إزالتهما دون أن تتحمل أي مسؤولية نتيجة لذلك.' },
                { n: '٧.٣', text: 'يجوز للشركة الاستعانة بجهات، أو أنظمة، أو قواعد بيانات حكومية، أو خاصة، أو أي وسائل تقنية تراها مناسبة للتحقق من صحة البيانات والمستندات المقدمة من المؤجر.' },
              ],
            },
            {
              title: 'المادة (٨) – حق الشركة في قبول الوحدات أو رفضها أو إزالتها',
              body: [
                'تحتفظ الشركة بحقها التقديري - وفقًا لما تراه ضروريًا لحماية مصالحها المشروعة - في قبول أي وحدة عقارية، أو رفضها، أو تعليقها، أو إزالتها، وكذلك أي محتوى أو بيانات مرتبطة بها، متى رأت أن ذلك لازم لحماية المنصة، أو المستخدمين، أو مصالحها، أو للامتثال للقوانين، أو السياسات الداخلية المعمول بها.',
                'ولا يترتب على ممارسة الشركة لهذا الحق أي التزام بتعويض المؤجر أو بيان أسباب القرار، ما لم ينص القانون على خلاف ذلك.',
              ],
            },
            {
              title: 'المادة (٩) – حدود مسؤولية الشركة عن المقابل المالي',
              body: [
                'يقر المؤجر بأن دور الشركة يقتصر على توفير وتشغيل المنصة الإلكترونية، وأن الشركة لا تضمن بأي حال من الأحوال تحقيق أي حد أدنى من الحجوزات، كما لا تضمن تحصيل أو سداد أي مستحقات مالية متفق عليها بين المؤجر والعميل إلا في حدود المبالغ التي تم تحصيلها فعليًا من خلال المنصة، ولا تتحمل أي مسؤولية عن انخفاض الطلب، أو تراجع الحجوزات، أو تغير ظروف السوق، أو المنافسة، أو أي عوامل أخرى خارجة عن إرادتها.',
              ],
            },
            {
              title: 'المادة (١٠) – حق الشركة في تعليق التحويلات المالية',
              body: [
                'يحق للشركة تعليق أو تأجيل تحويل أي مبالغ مستحقة للمؤجر بصورة مؤقتة في حال وجود شكوى جدية أو نزاع يتعلق بالحجز أو الوحدة محل التعامل أو في حال الاشتباه في مخالفة أحكام هذه الاتفاقية أو القوانين المعمول بها، وذلك لحين انتهاء المراجعة أو تسوية النزاع أو التحقق من الواقعة محل الشكوى، دون أن يترتب على ذلك أي مسؤولية على الشركة، ويكون قرار الشركة في هذا الشأن قرارًا مؤقتًا لا يترتب عليه إقرار بصحة أي ادعاء أو نزاع محل المراجعة.',
              ],
            },
          ],
        },
        {
          heading: 'التزامات المؤجر',
          articles: [
            {
              title: 'المادة (١١) – الالتزام بصحة البيانات والمستندات',
              body: [
                { n: '١١.١', text: 'يلتزم المؤجر بتقديم بيانات ومعلومات ومستندات صحيحة ودقيقة وكاملة عند التسجيل أو عند إدراج أي وحدة على المنصة.' },
                { n: '١١.٢', text: 'يضمن المؤجر صحة كافة البيانات والمعلومات والمستندات والصور المقدمة منه، ويتحمل وحده المسؤولية القانونية الكاملة عن أي بيانات غير صحيحة أو مضللة أو ناقصة.' },
                { n: '١١.٣', text: 'يلتزم المؤجر بإخطار الشركة فور علمه بأي خطأ أو تغيير يطرأ على البيانات أو المستندات أو المعلومات المقدمة منه.' },
              ],
            },
            {
              title: 'المادة (١٢) – الالتزام بتحديث بيانات الوحدة',
              body: [
                { n: '١٢.١', text: 'يلتزم المؤجر بالمحافظة على تحديث جميع البيانات الخاصة بالوحدة العقارية المدرجة على المنصة بصورة مستمرة.' },
                { n: '١٢.٢', text: 'يلتزم المؤجر بتحديث أي بيانات جوهرية تتعلق بالوحدة فور حدوثها، بما في ذلك الأسعار، أو المواصفات، أو الخدمات، أو حالة الوحدة، أو أي معلومات قد تؤثر على قرار الحجز.' },
                { n: '١٢.٣', text: 'يتحمل المؤجر وحده المسؤولية عن أي أضرار أو مطالبات تنشأ نتيجة عدم تحديث البيانات أو المعلومات الخاصة بالوحدة.' },
              ],
            },
            {
              title: 'المادة (١٣) – الالتزام بحق التأجير أو الإدارة',
              body: [
                { n: '١٣.١', text: 'يلتزم المؤجر بأن يكون مالكًا للوحدة أو مفوضًا قانونًا في إدارتها أو تأجيرها أو عرضها من خلال المنصة.' },
                { n: '١٣.٢', text: 'يلتزم المؤجر بالاحتفاظ بالمستندات التي تثبت حقه في عرض الوحدة وتأجيرها طوال مدة استخدامه للمنصة.' },
                { n: '١٣.٣', text: 'يتحمل المؤجر وحده كافة الآثار القانونية المترتبة على عدم توافر الحق القانوني اللازم لعرض الوحدة أو تأجيرها.' },
              ],
            },
            {
              title: 'المادة (١٤) – الالتزام بالرد على طلبات الحجز',
              body: [
                { n: '١٤.١', text: 'يلتزم المؤجر بمراجعة طلبات الحجز الواردة إليه من خلال المنصة والرد عليها خلال مدة لا تجاوز أربعًا وعشرين (٢٤) ساعة من تاريخ استلام الطلب.' },
                { n: '١٤.٢', text: 'يحق للشركة اعتبار طلب الحجز مرفوضًا أو ملغيًا تلقائيًا في حال انقضاء المدة المشار إليها دون رد من المؤجر.' },
                { n: '١٤.٣', text: 'لا تتحمل الشركة أي مسؤولية تجاه المؤجر أو العميل نتيجة إلغاء طلب الحجز بسبب عدم الرد خلال المدة المحددة.' },
              ],
            },
            {
              title: 'المادة (١٥) – الالتزام بتنفيذ الحجوزات المؤكدة',
              body: [
                { n: '١٥.١', text: 'يلتزم المؤجر بتنفيذ جميع الحجوزات التي تم تأكيدها وفقًا للإجراءات والسياسات المعمول بها على المنصة.' },
                { n: '١٥.٢', text: 'يجوز للمؤجر إلغاء الحجز المؤكد وفقًا للسياسات المعتمدة من الشركة، مع تحمله كافة الآثار المترتبة على ذلك وفقًا لأحكام هذه الاتفاقية.' },
                { n: '١٥.٣', text: 'يلتزم المؤجر بإخطار الشركة فور علمه بأي ظرف قد يؤثر على قدرته على تنفيذ الحجز أو الوفاء بالتزاماته تجاه العميل.' },
                { n: '١٥.٤', text: 'لا يخل إلغاء الحجز من قبل المؤجر بحق الشركة في اتخاذ ما تراه مناسبًا من إجراءات أو جزاءات وفقًا لأحكام هذه الاتفاقية.' },
              ],
            },
            {
              title: 'المادة (١٦) – الالتزام بصحة المقابل المالي المعروض على المنصة',
              body: [
                { n: '١٦.١', text: 'يلتزم المؤجر بإدراج القيمة الإيجارية الحقيقية وكافة المبالغ المستحقة من العميل بصورة صحيحة وكاملة.' },
                { n: '١٦.٢', text: 'يحظر على المؤجر تقديم أو تسجيل أو الإعلان عن أي قيمة صورية أو غير حقيقية أو إخفاء أي جزء من المقابل المالي أو الاتفاق على أي ترتيبات يكون من شأنها التحايل على رسوم، أو عمولات الشركة، أو تقليلها، أو تفاديها، بصورة مباشرة أو غير مباشرة.' },
                { n: '١٦.٣', text: 'في حال ثبوت مخالفة ذلك يحق للشركة إعادة احتساب الرسوم والعمولات المستحقة على أساس القيمة الفعلية للتعامل، وذلك دون الإخلال بحقها في تطبيق الجزاءات أو المطالبة بالتعويضات المقررة بموجب هذه الاتفاقية.' },
              ],
            },
          ],
        },
        {
          heading: 'الجزاءات والمسؤولية التعاقدية',
          articles: [
            {
              title: 'المادة (١٧) – الجزاءات التعاقدية',
              body: [
                'يحق للشركة، في حال إخلال المؤجر بأي حكم، أو التزام، أو تعهد، أو ضمان وارد في هذه الاتفاقية أو أي من السياسات أو الملحقات المرتبطة بها، اتخاذ ما تراه مناسبًا من إجراءات أو جزاءات وفقًا لجسامة المخالفة، بما في ذلك الإنذار، أو تعليق الوحدة، أو تعليق الحساب، أو تقييد بعض الخدمات، أو إنهاء الاتفاقية، وذلك دون الإخلال بأي حقوق أخرى مقررة للشركة بموجب القانون أو هذه الاتفاقية، ويكون للشركة تقدير الإجراء المناسب بحسب طبيعة المخالفة وجسامتها وذلك بما لا يخالف أحكام القانون.',
              ],
            },
            {
              title: 'المادة (١٨) – التعويض الاتفاقي',
              body: [
                'يلتزم المؤجر، في حال إخلاله بأي حكم، أو التزام، أو تعهد، أو ضمان وارد في هذه الاتفاقية أو السياسات أو الملحقات المرتبطة بها، وكان من شأن ذلك إلحاق ضرر بالشركة، أو المنصة، أو المستخدمين، أو مصالح الشركة المشروعة، بأداء تعويض اتفاقي يعادل إجمالي القيمة الإيجارية الحقيقية للحجز أو التعامل محل المخالفة، وذلك دون الإخلال بحق الشركة في اتخاذ أي جزاءات أو إجراءات أخرى مقررة بموجب هذه الاتفاقية أو القانون، أو المطالبة بالتعويض عن الأضرار التي تتجاوز قيمة التعويض الاتفاقي.',
              ],
            },
          ],
        },
        {
          heading: 'الأحكام الختامية',
          articles: [
            {
              title: 'المادة (١٩) – الموافقة الإلكترونية',
              body: [
                'يقر المؤجر بأن إتمام إجراءات التسجيل، أو إنشاء الحساب، أو استخدام المنصة، أو الضغط على خيار "موافق" أو أي وسيلة إلكترونية مماثلة مخصصة لإبداء القبول يعد قبولًا صريحًا وملزمًا لجميع أحكام هذه الاتفاقية والسياسات والملحقات المرتبطة بها، ويترتب عليه كافة الآثار القانونية المقررة قانونًا.',
              ],
            },
            {
              title: 'المادة (٢٠) – السجلات الإلكترونية والإثبات',
              body: [
                'يتفق الطرفان على الاعتداد بالسجلات والبيانات والرسائل والإشعارات الإلكترونية وسجلات العمليات المحفوظة لدى الشركة أو الصادرة من خلال المنصة كوسيلة معتبرة في إثبات استخدام المنصة وكافة العمليات والإجراءات والتصرفات التي تتم من خلال حساب المؤجر، وذلك ما لم يثبت خلاف ذلك بالطرق القانونية المقررة.',
              ],
            },
            {
              title: 'المادة (٢١) – اللغة المعتمدة',
              body: [
                'تم تحرير هذه الاتفاقية باللغتين العربية والإنجليزية، وفي حال وجود أي تعارض أو اختلاف أو تناقض بين النصين، تكون العبرة بالنص العربي ويعتد به باعتباره النص الحاكم في التفسير والتطبيق.',
              ],
            },
            {
              title: 'المادة (٢٢) – القانون الواجب التطبيق',
              body: [
                'تخضع هذه الاتفاقية وكافة السياسات والملحقات المرتبطة بها، من حيث التفسير والتنفيذ والآثار القانونية المترتبة عليها، لأحكام القوانين النافذة في جمهورية مصر العربية.',
              ],
            },
            {
              title: 'المادة (٢٣) – الاختصاص القضائي',
              body: [
                'تختص محاكم جمهورية مصر العربية بالفصل في أي نزاع أو مطالبة أو خلاف ينشأ عن هذه الاتفاقية أو يرتبط بها أو بتنفيذها أو تفسيرها، ويكون الاختصاص للمحكمة المختصة نوعيًا ومحليًا وفقًا للقواعد المقررة قانونًا.',
              ],
            },
            {
              title: 'المادة (٢٤) – القوة القاهرة',
              body: [
                'يلتزم كل طرف بتنفيذ التزاماته وفقًا لأحكام هذه الاتفاقية، ولا يعد أي منهما مسؤولًا عن عدم التنفيذ أو التأخر فيه إذا كان ذلك ناشئًا عن سبب خارج عن إرادته لا يمكن توقعه أو دفعه أو تلافي آثاره، وذلك طوال مدة استمرار تلك الظروف وفي حدود آثارها.',
              ],
            },
            {
              title: 'المادة (٢٥) – استقلال أحكام الاتفاقية',
              body: [
                'إذا تقرر بطلان أو عدم مشروعية أو عدم قابلية تنفيذ أي حكم من أحكام هذه الاتفاقية كليًا أو جزئيًا، فلا يترتب على ذلك بطلان أو عدم نفاذ باقي الأحكام، وتظل سارية ونافذة بالقدر الذي لا يتعارض مع الحكم الذي تقرر بطلانه أو عدم قابليته للتنفيذ.',
              ],
            },
            {
              title: 'المادة (٢٦) – التنازل عن الاتفاقية',
              body: [
                'لا يجوز للمؤجر التنازل عن هذه الاتفاقية أو عن أي من الحقوق أو الالتزامات الناشئة عنها، كليًا أو جزئيًا، لأي شخص أو جهة أخرى، إلا بعد الحصول على موافقة كتابية مسبقة من الشركة. ولا يخل ذلك بحق الشركة في نقل، أو إحالة، أو إعادة تنظيم حقوقها، أو التزاماتها المرتبطة بالمنصة، أو بنشاطها وفقًا لما تسمح به القوانين المعمول بها.',
              ],
            },
            {
              title: 'المادة (٢٧) – السياسات والملحقات',
              body: [
                'تعد جميع السياسات والملحقات والتعليمات والنماذج والإجراءات التشغيلية التي تعتمدها الشركة أو تنشرها على المنصة أو تحيل إليها هذه الاتفاقية جزءًا لا يتجزأ منها ومكملة لأحكامها، ويلتزم المؤجر بالاطلاع عليها والامتثال لها.',
                'ويجوز للشركة تعديل أو تحديث تلك السياسات أو الملحقات كلما اقتضت طبيعة تشغيل المنصة، أو المتطلبات القانونية، أو التنظيمية، أو الفنية ذلك، وتكون هذه التعديلات نافذة من تاريخ نشرها على المنصة أو من التاريخ الذي تحدده الشركة، وذلك دون الإخلال بالحقوق أو الالتزامات الناشئة قبل نفاذها، ما لم يقتض القانون خلاف ذلك.',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'guest',
      title: 'شروط المستأجر',
      subtitle: 'للمستأجرين الذين يجرون الحجوزات من خلال المنصة',
      groups: [
        {
          heading: 'الأحكام العامة المنظمة للعلاقة بين الشركة والمستأجر',
          articles: [
            {
              title: 'المادة (١) – نطاق العلاقة',
              body: [
                'تنظم هذه الاتفاقية العلاقة بين المستأجر والشركة فيما يتعلق باستخدام المنصة وإجراء الحجوزات والاستفادة من الخدمات المقدمة من خلالها، وذلك وفقًا لأحكام هذه الاتفاقية والسياسات والملحقات المرتبطة بها.',
              ],
            },
            {
              title: 'المادة (٢) – دور الشركة',
              body: [
                { n: '٢.١', text: 'تعمل الشركة بصفتها مشغلًا ومطورًا لمنصة إلكترونية متخصصة في عرض الوحدات العقارية وتسهيل عمليات الحجز وإدارة المدفوعات بين المؤجرين والمستأجرين.' },
                { n: '٢.٢', text: 'لا تعد الشركة مالكة أو مؤجرة أو مستأجرة لأي من الوحدات العقارية المعروضة عبر المنصة، كما لا تتولى إدارتها أو تشغيلها أو الإشراف المباشر عليها.' },
                { n: '٢.٣', text: 'لا تعد الشركة طرفًا في أي عقد إيجار، أو انتفاع، أو إقامة، أو أي اتفاق يتم بين المؤجر والمستأجر، وتنشأ كافة الحقوق والالتزامات الناشئة عن ذلك العقد مباشرة بين المؤجر والمستأجر.' },
              ],
            },
            {
              title: 'المادة (٣) – حدود مسؤولية الشركة',
              body: [
                'يقر المستأجر بأن الشركة يقتصر دورها على تشغيل المنصة الإلكترونية وتقديم الخدمات المرتبطة بها، ولا تتحمل أي مسؤولية عن الوحدة العقارية، أو حالتها، أو صلاحيتها، أو مطابقتها للوصف، أو عن تنفيذ التزامات المؤجر، أو أي نزاع ينشأ بين المؤجر والمستأجر، وذلك ما لم ينص القانون صراحة على خلاف ذلك.',
              ],
            },
          ],
        },
        {
          heading: 'التزامات المستأجر',
          articles: [
            {
              title: 'المادة (٤) – الالتزام بصحة البيانات',
              body: [
                { n: '٤.١', text: 'يلتزم المستأجر بتقديم بيانات ومعلومات صحيحة ودقيقة وكاملة عند إنشاء الحساب أو استخدام المنصة أو إجراء أي حجز.' },
                { n: '٤.٢', text: 'يلتزم المستأجر بتحديث بياناته متى طرأ عليها أي تغيير جوهري.' },
                { n: '٤.٣', text: 'يتحمل المستأجر وحده المسؤولية القانونية عن أي بيانات، أو معلومات غير صحيحة، أو مضللة، أو غير مكتملة يقدمها من خلال المنصة.' },
              ],
            },
            {
              title: 'المادة (٥) – الالتزام بشروط الحجز',
              body: [
                { n: '٥.١', text: 'يلتزم المستأجر بمراجعة بيانات الوحدة العقارية وشروط الحجز والمقابل المالي قبل إتمام الحجز.' },
                { n: '٥.٢', text: 'يلتزم المستأجر بسداد المبالغ المستحقة وفقًا للإجراءات والسياسات المعمول بها على المنصة.' },
                { n: '٥.٣', text: 'يلتزم المستأجر بالوفاء بكافة الالتزامات المترتبة على الحجز المؤكد وفقًا لأحكام هذه الاتفاقية والسياسات المرتبطة بها.' },
              ],
            },
            {
              title: 'المادة (٦) – الالتزام بالاستخدام المشروع للمنصة',
              body: [
                { n: '٦.١', text: 'يلتزم المستأجر باستخدام المنصة بصورة مشروعة وبما لا يخالف القوانين أو الآداب العامة أو حقوق الغير.' },
                { n: '٦.٢', text: 'يحظر على المستأجر استخدام المنصة لأي غرض غير مشروع أو تقديم أي بيانات أو محتوى من شأنه الإضرار بالشركة أو المنصة أو المستخدمين الآخرين.' },
              ],
            },
            {
              title: 'المادة (٧) – الالتزام بالقوانين',
              body: [
                'يلتزم المستأجر باستخدام المنصة والوحدة العقارية بما يتفق مع القوانين واللوائح والقرارات المعمول بها، كما يلتزم بعدم استخدام الوحدة في أي نشاط غير مشروع أو مخالف للنظام العام أو الآداب العامة، ويتحمل وحده كافة الآثار القانونية المترتبة على مخالفته لذلك.',
              ],
            },
            {
              title: 'المادة (٨) – الالتزام بقواعد الوحدة',
              body: [
                'يلتزم المستأجر بالاطلاع على القواعد والتعليمات والشروط الخاصة بالوحدة العقارية والمعلنة أو المقدمة من قبل المؤجر أو من خلال المنصة قبل أو أثناء الحجز، والامتثال لها طوال مدة الحجز، وذلك دون إخلال بما تقرره القوانين أو هذه الاتفاقية.',
              ],
            },
            {
              title: 'المادة (٩) – الالتزام بعدم التحايل على المنصة',
              body: [
                { n: '٩.١', text: 'يحظر على المستأجر التحايل على المنصة أو على أنظمة الحجز، أو المدفوعات، أو الرسوم، أو العمولات المطبقة من خلالها بأي صورة مباشرة أو غير مباشرة.' },
                { n: '٩.٢', text: 'كما يحظر على المستأجر استخدام المنصة للتوصل إلى المؤجر ثم إتمام، أو محاولة إتمام الحجز، أو التعاقد، أو السداد خارج المنصة بقصد تفادي الرسوم أو العمولات أو السياسات المعمول بها.' },
              ],
            },
            {
              title: 'المادة (١٠) – الالتزام بالإخطار عن المشكلات أو النزاعات',
              body: [
                'يلتزم المستأجر بإخطار الشركة خلال مدة معقولة بأي مشكلة أو شكوى أو نزاع يتعلق بالحجز أو باستخدام المنصة فور علمه بها، وذلك وفقًا للإجراءات المعمول بها على المنصة.',
              ],
            },
          ],
        },
        {
          heading: 'الجزاءات والمسؤولية التعاقدية',
          articles: [
            {
              title: 'المادة (١١) – الجزاءات التعاقدية',
              body: [
                'يحق للشركة، في حال مخالفة المستأجر لأي حكم أو التزام وارد في هذه الاتفاقية أو السياسات أو الملحقات المرتبطة بها، اتخاذ ما تراه مناسبًا من إجراءات أو جزاءات وفقًا لطبيعة المخالفة، بما في ذلك توجيه تنبيه، أو إنذار، أو تعليق الحجز، أو تعليق الحساب، أو تقييد بعض الخدمات، أو إنهاء الحساب، وذلك دون الإخلال بأي حقوق أخرى مقررة للشركة بموجب القانون أو هذه الاتفاقية.',
              ],
            },
            {
              title: 'المادة (١٢) – المسؤولية والتعويض',
              body: [
                'يلتزم المستأجر بتعويض الشركة عن أي أضرار أو خسائر أو مصروفات مباشرة تترتب على مخالفته لأحكام هذه الاتفاقية أو السياسات أو الملحقات المرتبطة بها، وذلك دون الإخلال بحق الشركة في اتخاذ أي إجراءات أو جزاءات أخرى مقررة بموجب هذه الاتفاقية أو القانون.',
              ],
            },
            {
              title: 'المادة (١٣) – إلغاء الحجز واسترداد المبالغ',
              body: [
                'تخضع عمليات إلغاء الحجز واسترداد المبالغ لسياسات الإلغاء والاسترداد المعمول بها على المنصة وقت إجراء الحجز. ويقر المستأجر بموافقته على تلك السياسات عند إتمام الحجز.',
                'وللشركة، عند معالجة طلبات الإلغاء أو الاسترداد، خصم، أو الاحتفاظ بالرسوم، أو العمولات، أو المبالغ غير القابلة للاسترداد وفقًا لسياسات المنصة المطبقة على الحجز محل الإلغاء، وذلك دون إخلال بأي حقوق أو التزامات أخرى مقررة بموجب هذه الاتفاقية أو القانون.',
              ],
            },
          ],
        },
        {
          heading: 'الأحكام الختامية',
          articles: [
            {
              title: 'المادة (١٤) – الموافقة الإلكترونية',
              body: [
                'يقر المستأجر بأن إتمام إجراءات التسجيل، أو إنشاء الحساب، أو استخدام المنصة، أو الضغط على خيار "موافق" أو أي وسيلة إلكترونية مماثلة مخصصة لإبداء القبول يعد قبولًا صريحًا وملزمًا لجميع أحكام هذه الاتفاقية والسياسات والملحقات المرتبطة بها، ويترتب عليه كافة الآثار القانونية المقررة قانونًا.',
              ],
            },
            {
              title: 'المادة (١٥) – السجلات الإلكترونية والإثبات',
              body: [
                'يتفق الطرفان على الاعتداد بالسجلات والبيانات والرسائل والإشعارات الإلكترونية وسجلات العمليات المحفوظة لدى الشركة أو الصادرة من خلال المنصة كوسيلة معتبرة في إثبات استخدام المنصة وكافة العمليات والإجراءات والتصرفات التي تتم من خلال حساب المستأجر، وذلك ما لم يثبت خلاف ذلك بالطرق القانونية المقررة.',
              ],
            },
            {
              title: 'المادة (١٦) – اللغة المعتمدة',
              body: [
                'تم تحرير هذه الاتفاقية باللغتين العربية والإنجليزية، وفي حال وجود أي تعارض أو اختلاف أو تناقض بين النصين، تكون العبرة بالنص العربي ويعتد به باعتباره النص الحاكم في التفسير والتطبيق.',
              ],
            },
          ],
        },
      ],
    },
  ],
}
